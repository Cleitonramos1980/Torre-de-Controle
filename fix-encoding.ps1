
# Corrige double-encoding UTF-8/Latin-1 nos JS do dist/assets
# "" + [char] forca string concat em vez de char arithmetic

function Fix-Mojibake([string]$text) {
    $s = ""  # prefixo para forcar String.Replace(string,string)
    $text = $text.Replace($s+[char]0xC3+[char]0xA7, $s+[char]0xE7)   # Ã§ -> ç
    $text = $text.Replace($s+[char]0xC3+[char]0xA3, $s+[char]0xE3)   # Ã£ -> ã
    $text = $text.Replace($s+[char]0xC3+[char]0xA9, $s+[char]0xE9)   # Ã© -> é
    $text = $text.Replace($s+[char]0xC3+[char]0xAA, $s+[char]0xEA)   # Ãª -> ê
    $text = $text.Replace($s+[char]0xC3+[char]0xAD, $s+[char]0xED)   # Ã­ -> í
    $text = $text.Replace($s+[char]0xC3+[char]0xB3, $s+[char]0xF3)   # Ã³ -> ó
    $text = $text.Replace($s+[char]0xC3+[char]0xBA, $s+[char]0xFA)   # Ãº -> ú
    $text = $text.Replace($s+[char]0xC3+[char]0xB4, $s+[char]0xF4)   # Ã´ -> ô
    $text = $text.Replace($s+[char]0xC3+[char]0xA2, $s+[char]0xE2)   # Ã¢ -> â
    $text = $text.Replace($s+[char]0xC3+[char]0xA1, $s+[char]0xE1)   # Ã¡ -> á
    $text = $text.Replace($s+[char]0xC3+[char]0xB5, $s+[char]0xF5)   # Ãµ -> õ
    $text = $text.Replace($s+[char]0xC3+[char]0xA0, $s+[char]0xE0)   # Ã  -> à
    $text = $text.Replace($s+[char]0xC3+[char]0xBC, $s+[char]0xFC)   # Ã¼ -> ü
    $text = $text.Replace($s+[char]0xC3+[char]0xB1, $s+[char]0xF1)   # Ã± -> ñ
    # Maiusculas (0x80-0x9F sao control chars em Latin-1 mas chars validos em Unicode)
    $text = $text.Replace($s+[char]0xC3+[char]0x87, $s+[char]0xC7)   # -> Ç
    $text = $text.Replace($s+[char]0xC3+[char]0x89, $s+[char]0xC9)   # -> É
    $text = $text.Replace($s+[char]0xC3+[char]0x93, $s+[char]0xD3)   # -> Ó
    $text = $text.Replace($s+[char]0xC3+[char]0x82, $s+[char]0xC2)   # -> Â
    $text = $text.Replace($s+[char]0xC3+[char]0x95, $s+[char]0xD5)   # -> Õ
    $text = $text.Replace($s+[char]0xC3+[char]0x80, $s+[char]0xC0)   # -> À
    $text = $text.Replace($s+[char]0xC3+[char]0x83, $s+[char]0xC3)   # -> Ã (o proprio)
    return $text
}

$dir = "c:\TorreControle\frontend\dist\assets"
$total = 0
foreach ($f in (Get-ChildItem $dir -Filter "*.js" | Select-Object -ExpandProperty FullName)) {
    $orig  = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
    $fixed = Fix-Mojibake $orig
    if ($fixed -ne $orig) {
        [System.IO.File]::WriteAllText($f, $fixed, [System.Text.Encoding]::UTF8)
        Write-Host "FIXED: $(Split-Path $f -Leaf)"
        $total++
    }
}
Write-Host "Total arquivos corrigidos: $total"
