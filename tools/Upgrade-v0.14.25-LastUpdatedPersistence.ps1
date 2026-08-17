# Upgrade-v0.14.25-LastUpdatedPersistence.ps1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "AHT Project Control v0.14.25 - Last Updated Persistence"
Write-Host ""

$path = "js/data-provider.js"
if (-not (Test-Path $path)) { throw "Could not find $path" }

$backup = "backup-v0.14.25-last-updated-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path "$backup/js" -Force | Out-Null
Copy-Item $path "$backup/js/data-provider.js" -Force

$content = Get-Content $path -Raw

$oldMap = @'
          archived: Boolean(fields.Archived),
          health: this.mapHealth(fields),
          updated: fields.LastActivityDate
            ? new Date(fields.LastActivityDate).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })
            : "",
          lastActivityDate: this.normalizeDate(fields.LastActivityDate),
'@

$newMap = @'
          archived: Boolean(fields.Archived),
          health: this.mapHealth(fields),

          // SharePoint is the permanent source for project Last Updated.
          lastUpdatedAt: item.lastModifiedDateTime || "",
          lastUpdatedBy:
            item.lastModifiedBy?.user?.displayName ||
            item.lastModifiedBy?.application?.displayName ||
            "",

          updated: item.lastModifiedDateTime
            ? new Date(item.lastModifiedDateTime).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric"
              })
            : "",

          lastActivityDate: this.normalizeDate(fields.LastActivityDate),
'@

if ($content.Contains($newMap)) {
    Write-Host "SKIP: SharePoint Last Updated load mapping already applied."
} elseif (-not $content.Contains($oldMap)) {
    throw "Could not find project load mapping. No changes made."
} else {
    $content = $content.Replace($oldMap, $newMap)
    Write-Host "PATCH: Project load mapping now restores SharePoint Last Updated."
}

$oldSave = @'
      const before = previousProjects.get(project.id);
      if (!project.sharePointId) {
        const created = await this.createItem(this.config.lists.projects, this.projectFields(project));
        project.sharePointId = Number(created.id);
      } else if (!before || this.comparable(this.projectFields(before)) !== this.comparable(this.projectFields(project))) {
        await this.updateItem(this.config.lists.projects, project.sharePointId, this.projectFields(project));
      }
'@

$newSave = @'
      const before = previousProjects.get(project.id);

      const projectWasTouched =
        Boolean(before) &&
        String(before.lastUpdatedAt || "") !== String(project.lastUpdatedAt || "");

      if (!project.sharePointId) {
        const created = await this.createItem(this.config.lists.projects, this.projectFields(project));
        project.sharePointId = Number(created.id);
      } else if (
        !before ||
        projectWasTouched ||
        this.comparable(this.projectFields(before)) !== this.comparable(this.projectFields(project))
      ) {
        await this.updateItem(
          this.config.lists.projects,
          project.sharePointId,
          this.projectFields(project)
        );
      }
'@

if ($content.Contains($newSave)) {
    Write-Host "SKIP: Project touch persistence already applied."
} elseif (-not $content.Contains($oldSave)) {
    throw "Could not find project save block. No changes made."
} else {
    $content = $content.Replace($oldSave, $newSave)
    Write-Host "PATCH: Parent Projects row now updates whenever touchProject changes."
}

Set-Content $path $content -NoNewline

Write-Host ""
Write-Host "SUCCESS: SharePoint Last Updated persistence patch complete."
Write-Host "Backup: $backup"
Write-Host "Do not commit yet. Test logout/login persistence first."
