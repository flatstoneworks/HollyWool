/**
 * Download a file from a URL with a given filename.
 * Creates a temporary anchor element to trigger the browser download.
 */
export async function handleDownload(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  const blob = await response.blob()
  const blobUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(blobUrl)
  document.body.removeChild(a)
}
