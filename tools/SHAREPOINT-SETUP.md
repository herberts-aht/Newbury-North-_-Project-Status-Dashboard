# SharePoint Setup Files

These files live inside the existing dashboard project:

- `docs/sharepoint-schema.md`
- `tools/Create-AHTDashboard.ps1`
- `tools/SampleData.json`

Do not run the script until an approved PnP/Entra Client ID is available.

From the project root in PowerShell:

```powershell
./tools/Create-AHTDashboard.ps1 -ClientId "YOUR-CLIENT-ID"
```

To also insert the small test dataset:

```powershell
./tools/Create-AHTDashboard.ps1 -ClientId "YOUR-CLIENT-ID" -SeedSampleData
```

The script connects to:

`https://ahtglobalteam.sharepoint.com/sites/NewburyNorth`

It does not delete or modify the existing **Control Dashboard** list.
