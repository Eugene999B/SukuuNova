# SukuuNova SMS commercial control

SukuuNova treats SMS as a prepaid platform resale product rather than an unlimited school feature.

## Provider routing

- Arkesel is the default SMS provider.
- Sailup, Hubtel and a generic HTTP gateway are supported as switchable alternatives.
- The active provider is a platform control-plane setting; API credentials remain server-side environment secrets.
- Provider switching never changes or creates platform/school credits.

## Credit ownership

1. Platform administration records provider-backed SMS purchases in `PlatformMessagingInventory`.
2. The owner portal shows available platform SMS stock.
3. Positive school allocations move units from platform inventory into the selected school's `PlatformMessagingWallet`.
4. Revoking unused school units returns them to platform inventory.
5. Every movement is recorded in the appropriate inventory/wallet ledger with acquisition cost, resale price and references when supplied.

Example: if platform stock is 600 SMS units and 200 are sold to School A, platform stock becomes 400 and School A's wallet becomes 200.

## Consumption and safeguards

- Schools cannot queue SMS without an active funded wallet.
- SMS is metered by billable GSM-7/UCS-2 segments, not merely one database message row.
- Bulk sends preflight valid-phone recipients and required units before queueing.
- The database wallet trigger is the final concurrency guard, preventing simultaneous sends from overspending a balance.
- Credits are reserved when a message is queued, including scheduled campaigns.
- Retries reuse the same reservation and do not charge again.
- When a message reaches permanent `failed` status, reserved units are returned to the school exactly once through `MessageCreditRefund` and an auditable wallet adjustment. Platform unsold inventory is not changed by this delivery-failure refund.

## Visibility

Platform super admins can see platform SMS stock, lifetime purchased units and the active provider on the owner landing dashboard, then open Billing to allocate/sell credits. Schools see only their own balance, resale rate, low-balance threshold, sender ID and the provider name; provider credentials remain hidden.
