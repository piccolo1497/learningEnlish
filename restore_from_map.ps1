$mapJson = Get-Content -Raw -Path "E:\Newword\enlish\.next\dev\server\chunks\ssr\app_page_tsx_0pxmutw._.js.map" | ConvertFrom-Json
[System.IO.File]::WriteAllText("e:\Newword\enlish\app\page.tsx", $mapJson.sections[0].map.sourcesContent[0])
Write-Host "Restored page.tsx!"
