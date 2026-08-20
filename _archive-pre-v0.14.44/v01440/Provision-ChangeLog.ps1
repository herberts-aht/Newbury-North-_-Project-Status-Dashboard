# Run after Connect-PnPOnline to the Newbury North site.
# Safe to re-run: it creates only missing list/columns.
$ListName = "Change Log"
$list = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
if (-not $list) {
  New-PnPList -Title $ListName -Template GenericList -OnQuickLaunch:$false | Out-Null
  Write-Host "Created SharePoint list: $ListName" -ForegroundColor Green
}
$fields = @(
  @{Name="EventTimestamp"; Display="Event Timestamp"; Type="DateTime"},
  @{Name="UserId"; Display="User ID"; Type="Text"},
  @{Name="UserName"; Display="User Name"; Type="Text"},
  @{Name="ProjectKey"; Display="Project Key"; Type="Text"},
  @{Name="ProjectName"; Display="Project Name"; Type="Text"},
  @{Name="Action"; Display="Action"; Type="Text"},
  @{Name="RecordType"; Display="Record Type"; Type="Text"},
  @{Name="Details"; Display="Details"; Type="Note"}
)
foreach ($f in $fields) {
  $existing = Get-PnPField -List $ListName -Identity $f.Name -ErrorAction SilentlyContinue
  if (-not $existing) {
    Add-PnPField -List $ListName -InternalName $f.Name -DisplayName $f.Display -Type $f.Type -AddToDefaultView | Out-Null
    Write-Host "Added $($f.Name)" -ForegroundColor Cyan
  }
}
Write-Host "Change Log SharePoint storage is ready." -ForegroundColor Green
