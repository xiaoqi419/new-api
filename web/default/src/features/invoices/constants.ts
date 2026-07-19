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
// Invoice Constants
// ============================================================================

export const INVOICE_PAGE_SIZE = 10

export const INVOICE_STATUS_PENDING = 0
export const INVOICE_STATUS_ISSUED = 1
export const INVOICE_STATUS_REJECTED = 2

export const TITLE_TYPE_PERSONAL = 1
export const TITLE_TYPE_COMPANY = 2

/** Max invoice PDF upload size (bytes), matches backend limit. */
export const MAX_INVOICE_FILE_BYTES = 10 * 1024 * 1024
