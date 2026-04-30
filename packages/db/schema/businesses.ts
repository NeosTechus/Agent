import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { organizations } from './organizations';

export const businesses = sqliteTable(
  'businesses',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    businessName: text('business_name').notNull(),
    address: text('address'),
    /** JSON-encoded weekly hours object */
    hoursJson: text('hours_json'),
    existingPhoneNumber: text('existing_phone_number'),
    twilioForwardingNumber: text('twilio_forwarding_number'),
    /** Vapi-internal phoneNumber.id, returned from `provisionPhoneNumber`.
     * Used as the originator for outbound test calls and to release the
     * number from Vapi when a customer churns (PRD 5.6 — 30-day hold). */
    vapiPhoneNumberId: text('vapi_phone_number_id'),
    /** Forwarding-probe state. Set when the wizard places a probe call
     * from our Vapi number to the customer's existing line; cleared on
     * verify. PRD 4.7. */
    forwardingProbeCallId: text('forwarding_probe_call_id'),
    forwardingProbeStartedAt: integer('forwarding_probe_started_at'),
    forwardingVerifiedAt: integer('forwarding_verified_at'),
    vertical: text('vertical'),
    /** JSON-encoded integration credentials/settings */
    integrationsJson: text('integrations_json'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    orgIdx: index('idx_businesses_organization_id').on(t.organizationId),
  }),
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
