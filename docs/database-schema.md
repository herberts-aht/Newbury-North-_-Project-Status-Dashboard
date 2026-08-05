# Hosted Database Schema

## users
`id`, `name`, `email`, `company`, `role`, `active`, `created_at`, `updated_at`

Temporary local passwords are not migrated. Hosted authentication or AHT SSO owns credentials.

## projects
`id`, `name`, `address`, `city`, `state`, `description`, `subtitle`, `phase`, `archived`,
`health_mode`, `health_override`, `health_override_note`,
`progress_planning`, `progress_engineering`, `progress_installation`,
`last_activity_date`, `last_activity`, `created_at`, `updated_at`, `updated_by_user_id`

## project_assignments
`id`, `project_id`, `user_id`, `created_at`

## deliverables
`id`, `project_id`, `discipline`, `deliverable`, `status`, `owner`,
`current_activity`, `waiting_on`, `next_step`, `target_date`, `risk`,
`visibility`, `created_at`, `updated_at`, `updated_by_user_id`, `archived`

## information_requests
`id`, `project_id`, `item`, `requested_from`, `status`, `blocking`,
`needed_by`, `notes`, `visibility`, `created_at`, `updated_at`,
`updated_by_user_id`, `archived`

## audit_log
`id`, `timestamp`, `user_id`, `user_name_snapshot`, `project_id`,
`project_name_snapshot`, `action`, `record_type`, `record_name`, `details`

Audit entries should be append-only.

## app_settings
`id`, `setting_key`, `setting_value`, `updated_at`, `updated_by_user_id`

## Required backend permission rules
- External users can access only assigned projects.
- External users cannot access `AHT Internal` or `Admin Only` records.
- Internal editors can edit assigned projects but cannot administer users.
- Administrators can manage users, assignments, and all projects.
- Hosted permissions must be enforced by the backend, not only by browser JavaScript.
