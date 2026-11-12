# PreToolUse 훅: Write/Edit 대상이 <cwd>\out\ 아래가 아니면 차단(exit 2)
# 한글 메시지 깨짐 방지: 이 파일은 UTF-8 BOM으로 저장해야 PowerShell 5.1이 UTF-8로 읽는다.
try {
  [Console]::InputEncoding = [Text.Encoding]::UTF8
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
} catch {}
$raw = [Console]::In.ReadToEnd()
$j = $raw | ConvertFrom-Json
$cwd = if ($j.cwd) { $j.cwd } else { (Get-Location).Path }
$target = $j.tool_input.file_path
if (-not $target) { $target = $j.tool_input.notebook_path }
if (-not $target) { [Console]::Error.WriteLine("대상 경로를 확인할 수 없어 차단합니다."); exit 2 }

try {
  $combined = if ([IO.Path]::IsPathRooted($target)) { $target } else { Join-Path $cwd $target }
  $full = [IO.Path]::GetFullPath($combined)
} catch {
  [Console]::Error.WriteLine("경로를 해석할 수 없어 차단합니다: $target")
  exit 2
}
$outRoot = [IO.Path]::GetFullPath((Join-Path $cwd 'out')).TrimEnd('\') + '\'

if ($full.StartsWith($outRoot, [StringComparison]::OrdinalIgnoreCase)) { exit 0 }

[Console]::Error.WriteLine("qc-aggregator는 out/ 아래에만 쓸 수 있습니다: $full")
exit 2
