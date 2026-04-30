import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { timestamps, softDelete } from './_shared';
import { organizations } from './organizations';
import { users } from './users';

export const voices = sqliteTable(
  'voices',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    elevenlabsVoiceId: text('elevenlabs_voice_id'),
    name: text('name').notNull(),
    sampleUrl: text('sample_url'),
    consentRecordingUrl: text('consent_recording_url'),
    approvedByAdminId: text('approved_by_admin_id').references(() => users.id),
    /** pending | approved | rejected | active */
    status: text('status', { enum: ['pending', 'approved', 'rejected', 'active'] })
      .notNull()
      .default('pending'),
    ...timestamps,
    ...softDelete,
  },
  (t) => ({
    orgIdx: index('idx_voices_organization_id').on(t.organizationId),
    elevenIdx: index('idx_voices_elevenlabs_voice_id').on(t.elevenlabsVoiceId),
  }),
);

export const voiceCloneRequests = sqliteTable(
  'voice_clone_requests',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    sampleR2Url: text('sample_r2_url').notNull(),
    consentRecordingR2Url: text('consent_recording_r2_url').notNull(),
    /** pending | approved | rejected */
    status: text('status', { enum: ['pending', 'approved', 'rejected'] })
      .notNull()
      .default('pending'),
    reviewedByAdminId: text('reviewed_by_admin_id').references(() => users.id),
    reviewedAt: integer('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    elevenlabsVoiceId: text('elevenlabs_voice_id'),
    ...timestamps,
  },
  (t) => ({
    orgIdx: index('idx_voice_clone_requests_organization_id').on(t.organizationId),
    statusIdx: index('idx_voice_clone_requests_status').on(t.status),
  }),
);

export type Voice = typeof voices.$inferSelect;
export type NewVoice = typeof voices.$inferInsert;
export type VoiceCloneRequest = typeof voiceCloneRequests.$inferSelect;
export type NewVoiceCloneRequest = typeof voiceCloneRequests.$inferInsert;
