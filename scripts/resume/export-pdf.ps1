param(
    [Parameter(Mandatory)][string]$Edition,
    [switch]$UseLibreOffice
)
# Word COM is the reference exporter: the canonical PDFs are what Word draws
# from the python-docx output, with live hyperlink annotations. Each document's
# page count is printed as Word laid it out; verify_resumes.py re-counts the PDF.
#
# -UseLibreOffice hands over to export_pdf_libreoffice.py, which checks the real
# fonts are installed and mirrors the NUS section rule LibreOffice otherwise
# draws upside down. A bare `soffice --convert-to pdf` does neither, which is
# why this switch no longer runs one.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$generated = Join-Path $root 'public/resume/generated'
$docx = Get-ChildItem (Join-Path $generated "rahul-mitra-*-$Edition.docx")
if (-not $docx) { throw "no DOCX for edition $Edition in $generated" }

if ($UseLibreOffice) {
    & python (Join-Path $PSScriptRoot 'export_pdf_libreoffice.py') --edition $Edition
    exit $LASTEXITCODE
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    foreach ($f in $docx) {
        $pdf = $f.FullName -replace '\.docx$', '.pdf'
        $d = $word.Documents.Open($f.FullName, $false, $true)  # ReadOnly
        $pages = $d.ComputeStatistics(2)                        # 2 = wdStatisticPages
        $d.ExportAsFixedFormat($pdf, 17)                        # 17 = wdExportFormatPDF
        $d.Close(0)
        Write-Host "word -> $($f.BaseName).pdf ($pages page$(if ($pages -ne 1) { 's' }))"
    }
}
finally {
    $word.Quit()
    [Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
