/*
Copyright (C) 2025 QuantumNous

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
// ============================================================================
// Identity Verification Constants
// ============================================================================

export const IDENTITY_PAGE_SIZE = 10

export const IDENTITY_STATUS_PENDING = 0
export const IDENTITY_STATUS_APPROVED = 1
export const IDENTITY_STATUS_REJECTED = 2

/** Max proof upload size (bytes), matches backend limit. */
export const MAX_IDENTITY_PROOF_BYTES = 10 * 1024 * 1024

/** Accepted proof file extensions, matches backend allowlist. */
export const IDENTITY_PROOF_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf'
