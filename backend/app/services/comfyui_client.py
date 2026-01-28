"""ComfyUI HTTP client for communicating with ComfyUI server.

Provides async methods for:
- Health checks
- Getting node/object info
- Queueing prompts
- Polling execution history
- Downloading generated images
"""

import uuid
import asyncio
from typing import Optional, Any
import httpx


class ComfyUIClient:
    """HTTP client for ComfyUI API.

    Default server URL is http://localhost:8188.
    """

    def __init__(self, base_url: str = "http://localhost:8188"):
        self.base_url = base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def check_health(self) -> bool:
        """Check if ComfyUI server is running and responsive.

        Returns True if server is available, False otherwise.
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/system_stats", timeout=5.0)
            return response.status_code == 200
        except Exception:
            return False

    async def get_system_stats(self) -> Optional[dict]:
        """Get ComfyUI system stats (GPU memory, etc.).

        Returns dict with system info or None if unavailable.
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/system_stats")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None

    async def get_object_info(self) -> Optional[dict]:
        """Get information about all available ComfyUI nodes.

        Returns dict mapping node class names to their input/output specs.
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/object_info")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None

    async def queue_prompt(
        self,
        workflow: dict,
        client_id: Optional[str] = None
    ) -> tuple[Optional[str], Optional[str]]:
        """Queue a workflow prompt for execution.

        Args:
            workflow: ComfyUI workflow JSON (API format)
            client_id: Optional client ID for websocket tracking

        Returns:
            Tuple of (prompt_id, error_message). prompt_id is None on error.
        """
        if client_id is None:
            client_id = str(uuid.uuid4())

        try:
            client = await self._get_client()
            payload = {
                "prompt": workflow,
                "client_id": client_id
            }
            response = await client.post(
                f"{self.base_url}/prompt",
                json=payload,
                timeout=10.0
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("prompt_id"), None
            else:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("error", {}).get("message", f"HTTP {response.status_code}")
                return None, error_msg

        except httpx.TimeoutException:
            return None, "Request timed out"
        except Exception as e:
            return None, str(e)

    async def get_history(self, prompt_id: str) -> Optional[dict]:
        """Get execution history for a prompt.

        Args:
            prompt_id: The prompt ID returned from queue_prompt

        Returns:
            History dict or None if not found/error.
            When execution is complete, returns:
            {
                "outputs": { node_id: { "images": [...] } },
                "status": { "status_str": "success", ... }
            }
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/history/{prompt_id}")

            if response.status_code == 200:
                data = response.json()
                # History endpoint returns { prompt_id: { ... } }
                return data.get(prompt_id)
            return None
        except Exception:
            return None

    async def get_queue(self) -> Optional[dict]:
        """Get current queue status.

        Returns dict with "queue_running" and "queue_pending" lists.
        """
        try:
            client = await self._get_client()
            response = await client.get(f"{self.base_url}/queue")
            if response.status_code == 200:
                return response.json()
            return None
        except Exception:
            return None

    async def get_image(
        self,
        filename: str,
        subfolder: str = "",
        folder_type: str = "output"
    ) -> Optional[bytes]:
        """Download a generated image from ComfyUI.

        Args:
            filename: The image filename
            subfolder: Subfolder within the output directory
            folder_type: "output", "input", or "temp"

        Returns:
            Image bytes or None on error.
        """
        try:
            client = await self._get_client()
            params = {
                "filename": filename,
                "type": folder_type
            }
            if subfolder:
                params["subfolder"] = subfolder

            response = await client.get(
                f"{self.base_url}/view",
                params=params,
                timeout=60.0  # Larger timeout for image downloads
            )

            if response.status_code == 200:
                return response.content
            return None
        except Exception:
            return None

    async def poll_until_complete(
        self,
        prompt_id: str,
        timeout_seconds: float = 300,
        poll_interval: float = 1.0
    ) -> tuple[Optional[dict], Optional[str]]:
        """Poll history until execution completes or times out.

        Args:
            prompt_id: The prompt ID to poll
            timeout_seconds: Maximum time to wait
            poll_interval: Seconds between polls

        Returns:
            Tuple of (history_result, error_message).
            history_result is the outputs dict on success.
        """
        elapsed = 0.0
        while elapsed < timeout_seconds:
            history = await self.get_history(prompt_id)

            if history:
                status = history.get("status", {})
                status_str = status.get("status_str", "")

                if status_str == "success":
                    return history.get("outputs", {}), None
                elif status_str == "error":
                    # Try to extract error message
                    error_messages = status.get("messages", [])
                    if error_messages:
                        return None, str(error_messages)
                    return None, "Execution failed"

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        return None, f"Execution timed out after {timeout_seconds}s"

    async def interrupt(self) -> bool:
        """Interrupt the current execution.

        Returns True if interrupt was sent successfully.
        """
        try:
            client = await self._get_client()
            response = await client.post(f"{self.base_url}/interrupt")
            return response.status_code == 200
        except Exception:
            return False

    async def clear_queue(self) -> bool:
        """Clear all pending items from queue.

        Returns True if queue was cleared successfully.
        """
        try:
            client = await self._get_client()
            response = await client.post(
                f"{self.base_url}/queue",
                json={"clear": True}
            )
            return response.status_code == 200
        except Exception:
            return False


# Global singleton instance
_comfyui_client: Optional[ComfyUIClient] = None


def get_comfyui_client() -> ComfyUIClient:
    """Get the global ComfyUI client instance."""
    global _comfyui_client
    if _comfyui_client is None:
        _comfyui_client = ComfyUIClient()
    return _comfyui_client
