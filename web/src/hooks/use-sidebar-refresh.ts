/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useLocation, useRouter } from '@tanstack/react-router'
import { useCallback, type MouseEvent } from 'react'

export function useSidebarRefresh() {
  const router = useRouter()
  const href = useLocation({ select: (location) => location.href })

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return
      }

      const destinationHref = event.currentTarget.href
      if (!destinationHref) return

      const destination = new URL(destinationHref)
      const current = new URL(href, destination)
      if (current.origin !== destination.origin) return
      if (current.pathname !== destination.pathname) return
      if (destination.search && current.search !== destination.search) return
      if (destination.hash && current.hash !== destination.hash) return

      event.preventDefault()
      void router.navigate({ href, reloadDocument: true, replace: true })
    },
    [href, router]
  )
}
