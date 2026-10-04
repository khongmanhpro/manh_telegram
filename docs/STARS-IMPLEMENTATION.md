# Stars and operations implementation

Scope: implement the approved Stars, durable payments, VND ledger, delivery queue,
reconciliation and notification templates plan. Keep legacy mode until the owner
sets Stars prices and terms and enables `PAYMENT_MODE=stars`.

## Progress
- [ ] Versioned additive migration and wallet ledger
- [ ] Durable payment inbox, Stars checkout and refunds
- [ ] Persistent delivery/notification worker and restart recovery
- [ ] Admin APIs and operational screens
- [ ] Regression, migration, browser and Docker verification

## Invariants
- VND and XTR never share a balance or aggregate.
- Money, assigned stock and queued work commit together; network calls occur afterwards.
- Duplicate events/actions cannot allocate stock or change a balance twice.
- Historical transactions are never automatically replayed.
- Delivery retries can resend the same content after an uncertain network outcome;
  they must never take additional stock.
- No live payments, customer messages, production configuration changes or deployment.
