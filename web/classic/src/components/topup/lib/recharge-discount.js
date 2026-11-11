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
export function rechargeDiscount(amount, info, preset) {
 if (info?.topup_bonus?.mode !== 'discount') return preset || info?.discount?.[amount] || 1;
 let threshold = 0;
 let rate = 1;
 for (const tier of info.topup_bonus.tiers) {
  if (tier.pay <= amount && tier.pay > threshold && tier.discount > 0 && tier.discount < 1) {
   threshold = tier.pay;
   rate = tier.discount;
  }
 }
 return rate;
}
