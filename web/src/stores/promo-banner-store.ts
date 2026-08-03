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
import { create } from 'zustand'

interface PromoBannerState {
  dismissed: boolean
  dismiss: () => void
}

/**
 * Deliberately not persisted: closing the strip should only last for the
 * current page session, so a reload brings the promotion back. The state is
 * shared because the layouts reserve vertical space for the strip and have to
 * re-render alongside it.
 */
export const usePromoBannerStore = create<PromoBannerState>()((set) => ({
  dismissed: false,
  dismiss: () => set({ dismissed: true }),
}))
