$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$piArgument = @($args)

# These limits belong to this launcher process and contain no private state.
$env:PI_SUBAGENT_MAX_SPAWNS_PER_SESSION = "10"
$env:PI_SUBAGENT_MAX_DEPTH = "1"
$env:PI_SUBAGENTS_WORKTREE_DIR = Join-Path $projectRoot ".pi\worktrees"

Push-Location $projectRoot
try {
    & pi @piArgument
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
