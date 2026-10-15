param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\public\lh-data.json')
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $InputPath)) { throw "엑셀 파일을 찾을 수 없습니다: $InputPath" }

function CellText($sheet, [int]$row, [int]$column) {
  return ([string]$sheet.Cells.Item($row, $column).Text).Trim()
}

function CellNumber($sheet, [int]$row, [int]$column) {
  $value = $sheet.Cells.Item($row, $column).Value2
  if ($null -eq $value -or $value -eq '') { return $null }
  return [double]$value
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
  $workbook = $excel.Workbooks.Open((Resolve-Path -LiteralPath $InputPath).Path, $null, $true)
  $sheet = $workbook.Worksheets.Item('든든전세')
  $listings = @()

  for ($row = 7; $row -le $sheet.UsedRange.Rows.Count; $row++) {
    $sequence = CellNumber $sheet $row 1
    if ($null -eq $sequence) { continue }

    $address = CellText $sheet $row 5
    $district = '경기남부'
    if ($address -match '^경기도\s+(\S+시)(?:\s+(\S+구))?') {
      $district = $Matches[1] + $(if ($Matches[2]) { " $($Matches[2])" } else { '' })
    }
    $usableArea = CellNumber $sheet $row 9

    $listings += [ordered]@{
      provider = 'LH'
      program = '경기남부'
      noticeDate = '2026-09-30'
      id = "lh-20260930-$([int]$sequence)"
      sequence = [int]$sequence
      city = '경기도'
      district = $district
      housingGroup = (CellText $sheet $row 4)
      buildingName = (CellText $sheet $row 4)
      address = $address
      buildingDong = (CellText $sheet $row 6)
      unit = (CellText $sheet $row 7)
      supplyType = (CellText $sheet $row 8)
      usableAreaM2 = $usableArea
      expandedAreaM2 = (CellNumber $sheet $row 10)
      exclusiveAreaM2 = (CellNumber $sheet $row 11)
      areaM2 = $usableArea
      areaPyeong = [math]::Round($usableArea / 3.305785, 1)
      rooms = (CellText $sheet $row 12)
      floor = (CellText $sheet $row 13)
      elevator = (CellText $sheet $row 14)
      housingType = (CellText $sheet $row 15)
      depositWon = [long](CellNumber $sheet $row 16)
      note = (CellText $sheet $row 17)
      applicants = $null;
      applicationPeriod = "2026.10.21. 10:00 ~ 2026.10.23. 16:00"
      detailUrl = 'https://apply.lh.or.kr'
      lat = $null
      lng = $null
    }
  }

  $data = [ordered]@{
    meta = [ordered]@{
      provider = 'LH'
      program = '경기남부 든든전세주택(비분양전환)'
      noticeDate = '2026-09-30'
      source = 'https://apply.lh.or.kr'
      sourceFile = [IO.Path]::GetFileName($InputPath)
      importedAt = (Get-Date).ToUniversalTime().ToString('o')
      total = $listings.Count
      located = 0
      applicationPeriod = '2026.10.21. 10:00 ~ 2026.10.23. 16:00'
      documentTargetAnnouncement = '2026.10.27. 17:00 이후'
      winnerAnnouncement = '2026.12.02. 17:00 이후'
      eligibility = '모집공고일(2026.09.30.) 현재 수도권에 거주하는 무주택세대구성원'
      leasePeriod = '2년, 재계약 3회 가능(최장 8년)'
    }
    listings = $listings
  }

  $target = [IO.Path]::GetFullPath($OutputPath)
  [IO.File]::WriteAllText($target, ($data | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
  Write-Host "LH 주택 $($listings.Count)호를 저장했습니다: $target"
} finally {
  if ($workbook) { $workbook.Close($false) }
  $excel.Quit()
  if ($sheet) { [Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) | Out-Null }
  if ($workbook) { [Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null }
  [Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

