$file = "c:\TorreControle\frontend\dist\assets\index-Cw1PFMX8.js"
$text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Helpers de caracteres acentuados
function C([int]$cp) { return [string][char]$cp }
$i_agu  = C(237)   # í
$a_agu  = C(225)   # á
$c_ced  = C(231)   # ç
$a_til  = C(227)   # ã
$o_agu  = C(243)   # ó
$e_agu  = C(233)   # é

$lSaida   = "Sa" + $i_agu + "da de Funcion" + $a_agu + "rio"
$lAprov   = "Aprova" + $c_ced + $a_til + "o de Sa" + $i_agu + "das"
$lLeitura = "Leitura de Sa" + $i_agu + "da"
$lHist    = "Hist" + $o_agu + "rico de Sa" + $i_agu + "das"

# ── 1. Lazy imports ─────────────────────────────────────────────────────────────
$anchorLazy = 'import("./ChecklistPortariaFormPage-Custom.js"),__vite__mapDeps([]))),_cFD='
$newLazy    = 'import("./ChecklistPortariaFormPage-Custom.js"),__vite__mapDeps([]))),_cSF=d.lazy(()=>T(()=>import("./SaidaFuncionarioPage-Custom.js"),__vite__mapDeps([]))),_cAS=d.lazy(()=>T(()=>import("./AprovacaoSaidaPage-Custom.js"),__vite__mapDeps([]))),_cLS=d.lazy(()=>T(()=>import("./LeituraSaidaPage-Custom.js"),__vite__mapDeps([]))),_cHS=d.lazy(()=>T(()=>import("./HistoricoSaidasPage-Custom.js"),__vite__mapDeps([]))),_cFD='

if ($text.Contains($anchorLazy) -and -not $text.Contains('SaidaFuncionarioPage-Custom.js')) {
    $text = $text.Replace($anchorLazy, $newLazy)
    Write-Host "1. Lazy imports OK"
} elseif ($text.Contains('SaidaFuncionarioPage-Custom.js')) {
    Write-Host "1. Lazy imports JA EXISTE"
} else {
    Write-Host "1. ERRO: ancora lazy nao encontrada"
}

# ── 2. Flat nav (array Tb) ──────────────────────────────────────────────────────
$anchorFlat = 'path:"/portaria/checklist",icon:js,modulo:"operacional",group:"Portaria & Visitantes"},{label:"Frota"'
$newFlat    = 'path:"/portaria/checklist",icon:js,modulo:"operacional",group:"Portaria & Visitantes"},{label:"' + $lSaida + '",path:"/portaria/saida-funcionario",icon:js,modulo:"operacional",group:"Portaria & Visitantes"},{label:"' + $lAprov + '",path:"/portaria/aprovacao-saida",icon:js,modulo:"operacional",group:"Portaria & Visitantes"},{label:"' + $lLeitura + '",path:"/portaria/leitura-saida",icon:aw,modulo:"operacional",group:"Portaria & Visitantes"},{label:"' + $lHist + '",path:"/portaria/historico-saidas",icon:js,modulo:"operacional",group:"Portaria & Visitantes"},{label:"Frota"'

if ($text.Contains($anchorFlat) -and -not $text.Contains('"/portaria/saida-funcionario"')) {
    $text = $text.Replace($anchorFlat, $newFlat)
    Write-Host "2. Flat nav OK"
} elseif ($text.Contains('"/portaria/saida-funcionario"')) {
    Write-Host "2. Flat nav JA EXISTE"
} else {
    Write-Host "2. ERRO: ancora flat nav nao encontrada"
}

# ── 3. Hier nav (nested sidebar) ────────────────────────────────────────────────
$anchorHier = '{path:"/portaria/checklist",label:"Checklist de Vistoria"}]}'
$newHier    = '{path:"/portaria/checklist",label:"Checklist de Vistoria"},{path:"/portaria/saida-funcionario",label:"' + $lSaida + '"},{path:"/portaria/aprovacao-saida",label:"' + $lAprov + '"},{path:"/portaria/leitura-saida",label:"' + $lLeitura + '"},{path:"/portaria/historico-saidas",label:"' + $lHist + '"}]}'

if ($text.Contains($anchorHier) -and -not $text.Contains('"/portaria/saida-funcionario",label:')) {
    $text = $text.Replace($anchorHier, $newHier)
    Write-Host "3. Hier nav OK"
} elseif ($text.Contains('"/portaria/saida-funcionario",label:')) {
    Write-Host "3. Hier nav JA EXISTE"
} else {
    Write-Host "3. ERRO: ancora hier nav nao encontrada"
    $i = $text.IndexOf('path:"/portaria/checklist",label:')
    if ($i -ge 0) { Write-Host "  ctx: " + $text.Substring($i, 150) }
}

# ── 4. Routes ──────────────────────────────────────────────────────────────────
$anchorRoute = 's.jsx(b,{path:"/portaria/checklist/:id",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cCLF,{})})})}),s.jsx(b,{path:"/fiscal"'
$newRoute    = 's.jsx(b,{path:"/portaria/checklist/:id",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cCLF,{})})})}),s.jsx(b,{path:"/portaria/saida-funcionario",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cSF,{})})})}),s.jsx(b,{path:"/portaria/aprovacao-saida",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cAS,{})})})}),s.jsx(b,{path:"/portaria/leitura-saida",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cLS,{})})})}),s.jsx(b,{path:"/portaria/historico-saidas",element:s.jsx(P,{children:s.jsx(R,{children:s.jsx(_cHS,{})})})}),s.jsx(b,{path:"/fiscal"'

if ($text.Contains($anchorRoute) -and -not $text.Contains('path:"/portaria/saida-funcionario",element:')) {
    $text = $text.Replace($anchorRoute, $newRoute)
    Write-Host "4. Routes OK"
} elseif ($text.Contains('path:"/portaria/saida-funcionario",element:')) {
    Write-Host "4. Routes JA EXISTE"
} else {
    Write-Host "4. ERRO: ancora routes nao encontrada"
    $i = $text.IndexOf('path:"/portaria/checklist/:id",element:')
    if ($i -ge 0) { Write-Host "  ctx: " + $text.Substring($i, 200) }
}

[System.IO.File]::WriteAllText($file, $text, [System.Text.Encoding]::UTF8)
Write-Host "SALVO."
