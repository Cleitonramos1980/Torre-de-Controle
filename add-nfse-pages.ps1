$file = "c:\TorreControle\frontend\dist\assets\index-Cw1PFMX8.js"
$text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# ── 1. Lazy imports ──────────────────────────────────────────────────────────
$anchorLazy = '_cFDOC=d.lazy(()=>T(()=>import("./FiscalDocumentoPage-Custom.js"),__vite__mapDeps([]))),mP'
$newLazy     = '_cFDOC=d.lazy(()=>T(()=>import("./FiscalDocumentoPage-Custom.js"),__vite__mapDeps([]))),_cNFSeNAC=d.lazy(()=>T(()=>import("./FiscalNFSeNacionalPage-Custom.js"),__vite__mapDeps([]))),_cNFSeEMI=d.lazy(()=>T(()=>import("./FiscalNFSeEmitidasPage-Custom.js"),__vite__mapDeps([]))),_cNFSeNOV=d.lazy(()=>T(()=>import("./FiscalNFSeNovaEmissaoPage-Custom.js"),__vite__mapDeps([]))),_cNFSeCFG=d.lazy(()=>T(()=>import("./FiscalNFSeConfigPage-Custom.js"),__vite__mapDeps([]))),_cNFSeSRV=d.lazy(()=>T(()=>import("./FiscalNFSeServicosPage-Custom.js"),__vite__mapDeps([]))),mP'

if ($text.Contains($anchorLazy) -and -not $text.Contains('FiscalNFSeNacionalPage-Custom.js')) {
    $text = $text.Replace($anchorLazy, $newLazy)
    Write-Host "1. Lazy imports NFSe OK"
} elseif ($text.Contains('FiscalNFSeNacionalPage-Custom.js')) {
    Write-Host "1. Lazy imports NFSe JA EXISTE"
} else {
    Write-Host "1. ERRO: ancora lazy nao encontrada"
    $i = $text.IndexOf('FiscalDocumentoPage-Custom.js')
    if ($i -ge 0) { Write-Host "  contexto: " + $text.Substring([Math]::Max(0,$i-40), 120) }
}

# ── 2. Flat nav ───────────────────────────────────────────────────────────────
$anchorFlat = 'path:"/fiscal/nfse-tomadas",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Certificados"'
$newFlat    = 'path:"/fiscal/nfse-tomadas",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"NFS-e Nacional",path:"/fiscal/nfse-nacional",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"NFS-e Emitidas",path:"/fiscal/nfse-emitidas",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Nova Emissao NFS-e",path:"/fiscal/nfse-nova-emissao",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Config NFS-e",path:"/fiscal/nfse-config",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Catalogo Servicos",path:"/fiscal/nfse-servicos",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Certificados"'

if ($text.Contains($anchorFlat) -and -not $text.Contains('"/fiscal/nfse-nacional"')) {
    $text = $text.Replace($anchorFlat, $newFlat)
    Write-Host "2. Flat nav NFSe OK"
} elseif ($text.Contains('"/fiscal/nfse-nacional"')) {
    Write-Host "2. Flat nav NFSe JA EXISTE"
} else {
    Write-Host "2. ERRO: ancora flat nav nao encontrada"
}

# ── 3. Hier nav ───────────────────────────────────────────────────────────────
$anchorHier = '{path:"/fiscal/nfse-tomadas",label:"NFS-e Tomadas"},{path:"/fiscal/certificados"'
$newHier    = '{path:"/fiscal/nfse-tomadas",label:"NFS-e Tomadas"},{path:"/fiscal/nfse-nacional",label:"NFS-e Nacional"},{path:"/fiscal/nfse-emitidas",label:"NFS-e Emitidas"},{path:"/fiscal/nfse-nova-emissao",label:"Nova Emissao"},{path:"/fiscal/nfse-config",label:"Config NFS-e"},{path:"/fiscal/nfse-servicos",label:"Catalogo Servicos"},{path:"/fiscal/certificados"'

if ($text.Contains($anchorHier) -and -not $text.Contains('"/fiscal/nfse-nacional",label:"NFS-e Nacional"')) {
    $text = $text.Replace($anchorHier, $newHier)
    Write-Host "3. Hier nav NFSe OK"
} elseif ($text.Contains('"/fiscal/nfse-nacional",label:"NFS-e Nacional"')) {
    Write-Host "3. Hier nav NFSe JA EXISTE"
} else {
    Write-Host "3. ERRO: ancora hier nav nao encontrada"
    $i = $text.IndexOf('{path:"/fiscal/nfse-tomadas",label:')
    if ($i -ge 0) { Write-Host "  contexto: " + $text.Substring($i, 120) }
}

# ── 4. Routes ─────────────────────────────────────────────────────────────────
$anchorRoute = 's.jsx(b,{path:"/fiscal/nfse-tomadas",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cFNTK,{})})})}),s.jsx(b,{path:"/fiscal/documento'
$newRoute    = 's.jsx(b,{path:"/fiscal/nfse-tomadas",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cFNTK,{})})})}),s.jsx(b,{path:"/fiscal/nfse-nacional",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cNFSeNAC,{})})})}),s.jsx(b,{path:"/fiscal/nfse-emitidas",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cNFSeEMI,{})})})}),s.jsx(b,{path:"/fiscal/nfse-nova-emissao",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cNFSeNOV,{})})})}),s.jsx(b,{path:"/fiscal/nfse-config",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cNFSeCFG,{})})})}),s.jsx(b,{path:"/fiscal/nfse-servicos",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cNFSeSRV,{})})})}),s.jsx(b,{path:"/fiscal/documento'

if ($text.Contains($anchorRoute) -and -not $text.Contains('path:"/fiscal/nfse-nacional",element')) {
    $text = $text.Replace($anchorRoute, $newRoute)
    Write-Host "4. Routes NFSe OK"
} elseif ($text.Contains('path:"/fiscal/nfse-nacional",element')) {
    Write-Host "4. Routes NFSe JA EXISTE"
} else {
    Write-Host "4. ERRO: ancora routes nao encontrada"
    $i = $text.IndexOf('path:"/fiscal/nfse-tomadas",element')
    if ($i -ge 0) { Write-Host "  contexto: " + $text.Substring([Math]::Max(0,$i-20), 150) }
}

[System.IO.File]::WriteAllText($file, $text, [System.Text.Encoding]::UTF8)
Write-Host "SALVO."
