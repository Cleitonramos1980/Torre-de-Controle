$envPath = "C:\TorreControle\.env"
Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { return }
    $sep = $line.IndexOf("=")
    if ($sep -lt 1) { return }
    Set-Item "env:$($line.Substring(0,$sep).Trim())" $line.Substring($sep+1).Trim()
}
Set-Location "C:\TorreControle\backend"
& "C:\TorreControle\runtime\node\node.exe" "C:\TorreControle\backend\dist\server.js"