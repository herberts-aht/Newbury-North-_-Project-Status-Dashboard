# Hosting and Storage Deployment Checklist

## Ownership
- Confirm whether hosting is independent or AHT-managed.
- Confirm the authentication provider.
- Confirm the database/storage provider.
- Confirm who owns credentials, billing, backups, support, and the repository.

## Security
- Disable the temporary local-password provider.
- Keep service keys and private SSO credentials out of GitHub.
- Configure environment variables in the hosting platform.
- Enforce project and record permissions in the backend.
- Confirm HTTPS.
- Test inactive-user access and external-user visibility.

## Data migration
- Export a current JSON backup.
- Verify backup format, application version, and record counts.
- Import users without temporary passwords.
- Import projects, assignments, deliverables, information requests, and audit entries.
- Compare imported record counts with the backup.
- Spot-check each project.
- Retain the original JSON backup.

## Validation
- Test Administrator, Internal Editor, and External Viewer access.
- Confirm assigned-project restrictions.
- Confirm internal/admin visibility restrictions.
- Create, edit, archive, and restore test records.
- Confirm Change Log entries.
- Confirm backup and recovery procedures.
- Confirm sign-out and session expiration.

## Publish
- Tag the deployed Git commit.
- Record the application version.
- Record the deployment owner and support contact.
- Publish only after temporary login has been removed.
