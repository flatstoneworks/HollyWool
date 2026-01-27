import { Outlet } from 'react-router-dom'
import { NavSidebar } from './NavSidebar'
import { ContentHeader } from './ContentHeader'

export function Layout() {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <NavSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <ContentHeader />
        <main className="flex-1 flex overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
