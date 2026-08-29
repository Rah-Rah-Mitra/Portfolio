param(
    [Parameter(Mandatory)][string]$Edition,
    [switch]$UseLibreOffice
)
# Word COM is primary (best Times New Roman fidelity + keeps hyperlink
# annotations). LibreOffice fallback shifts pagination slightly: re-verify.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$generated = Join-Path $root 'public/resume/generated'
$docx = Get-ChildItem (Join-Path $generated "rahul-mitra-*-$Edition.docx")
if (-not $docx) { throw "no DOCX for edition $Edition in $generated" }

if ($UseLibreOffice) {
    $soffice = 'C:\Program Files\LibreOffice\program\soffice.exe'
    foreach ($f in $docx) {
        & $soffice --headless --convert-to pdf --outdir $generated $f.FullName | Out-Null
        Write-Host "libreoffice -> $($f.BaseName).pdf"
    }
    exit 0
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    foreach ($f in $docx) {
        $pdf = $f.FullName -replace '\.docx$', '.pdf'
        $d = $word.Documents.Open($f.FullName, $false, $true)  # ReadOnly
        $d.ExportAsFixedFormat($pdf, 17)                        # 17 = wdExportFormatPDF
        $d.Close(0)
        Write-Host "word -> $($f.BaseName).pdf"
    }
}
finally {
    $word.Quit()
    [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
