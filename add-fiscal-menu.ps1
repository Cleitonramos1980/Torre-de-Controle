
$file = "c:\TorreControle\frontend\dist\assets\index-Cw1PFMX8.js"
$text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

# Caracter helpers (evita problemas de encoding no proprio script)
function C([int]$cp) { return [string][char]$cp }
$a_til  = C(0xE3)  # a com til  (ã)
$e_cir  = C(0xEA)  # e circunflexo (ê)
$o_agu  = C(0xF3)  # o agudo (ó)
$c_ced  = C(0xE7)  # c cedilha (ç)
$o_til  = C(0xF5)  # o com til (õ)

# Labels com acentos
$lManif  = "Manifesta" + $c_ced + $a_til + "o"
$lDiverg = "Diverg" + $e_cir + "ncias"
$lRelat  = "Relat" + $o_agu + "rios Fiscais"
$lConf   = "Configura" + $c_ced + $o_til + "es"

# ── 3. Nav flat — ancora ASCII-safe ──────────────────────────────────────────
$anchorFlat = 'path:"/custodia",icon:yc,modulo:"operacional",group:"Monitoramento & Fiscal"},{label:'
$navF = 'path:"/custodia",icon:yc,modulo:"operacional",group:"Monitoramento & Fiscal"},{label:"Fiscal",path:"/fiscal",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"NF-e",path:"/fiscal/nfe",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"CT-e",path:"/fiscal/cte",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"' + $lManif + '",path:"/fiscal/manifestacao",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"SEFAZ Pendentes",path:"/fiscal/sefaz-pendentes",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Alertas Fiscais",path:"/fiscal/alertas",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"' + $lDiverg + '",path:"/fiscal/divergencias",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Auditoria",path:"/fiscal/auditoria",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Risco Fiscal",path:"/fiscal/risco",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"XML Vault",path:"/fiscal/xml-vault",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"' + $lRelat + '",path:"/fiscal/relatorios",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"NFS-e Tomadas",path:"/fiscal/nfse-tomadas",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"Certificados",path:"/fiscal/certificados",icon:yc,modulo:"operacional",group:"Fiscal"},{label:"' + $lConf + '",path:"/fiscal/configuracoes",icon:yc,modulo:"operacional",group:"Fiscal"},{label:'

if ($text.Contains($anchorFlat) -and -not $text.Contains('group:"Fiscal"')) {
    $text = $text.Replace($anchorFlat, $navF)
    Write-Host "3. Nav flat OK"
} elseif ($text.Contains('group:"Fiscal"')) {
    Write-Host "3. Nav flat JA EXISTE"
} else {
    Write-Host "3. Nav flat: ancora nao encontrada"
    Write-Host "  Procurando /custodia..."
    $i = $text.IndexOf('path:"/custodia"')
    if ($i -ge 0) { Write-Host "  >> " + $text.Substring($i, 100) }
}

# ── 4. Nav hierarquico — ancora ASCII-safe ────────────────────────────────────
$anchorHier = 'path:"/nf-transito",label:'
$idxH = $text.IndexOf($anchorHier)
if ($idxH -ge 0 -and -not $text.Contains('"label":"Fiscal",icon:yc') -and -not $text.Contains('label:"Fiscal",icon:yc')) {
    # Encontrar o fim do bloco NF-em-Transito (fecha com }])
    $endH = $text.IndexOf(']}', $idxH)
    if ($endH -ge 0) {
        $addH = ',{path:"/fiscal",label:"Fiscal",icon:yc,modulo:"operacional",children:[' +
                '{path:"/fiscal",label:"Dashboard Fiscal"},' +
                '{path:"/fiscal/nfe",label:"NF-e"},' +
                '{path:"/fiscal/cte",label:"CT-e"},' +
                '{path:"/fiscal/manifestacao",label:"' + $lManif + '"},' +
                '{path:"/fiscal/sefaz-pendentes",label:"SEFAZ Pendentes"},' +
                '{path:"/fiscal/alertas",label:"Alertas"},' +
                '{path:"/fiscal/divergencias",label:"' + $lDiverg + '"},' +
                '{path:"/fiscal/auditoria",label:"Auditoria"},' +
                '{path:"/fiscal/risco",label:"Risco Fiscal"},' +
                '{path:"/fiscal/xml-vault",label:"XML Vault"},' +
                '{path:"/fiscal/relatorios",label:"' + $lRelat + '"},' +
                '{path:"/fiscal/nfse-tomadas",label:"NFS-e Tomadas"},' +
                '{path:"/fiscal/certificados",label:"Certificados"},' +
                '{path:"/fiscal/configuracoes",label:"' + $lConf + '"}]}'
        $text = $text.Substring(0, $endH + 2) + $addH + $text.Substring($endH + 2)
        Write-Host "4. Nav hierarquico OK (inserido em pos $($endH+2))"
    }
} else {
    Write-Host "4. Nav hierarquico JA EXISTE ou ancora nao encontrada"
}

[System.IO.File]::WriteAllText($file, $text, [System.Text.Encoding]::UTF8)
Write-Host "SALVO."
