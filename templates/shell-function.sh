# memsudo shell function — add to ~/.zshrc or ~/.bashrc
# Enables: memsudo room enter <name> (with actual cd)
memsudo() {
  if [ "$1" = "room" ] && [ "$2" = "enter" ]; then
    local target
    target=$(command memsudo room enter "$3" --path-only 2>/dev/null)
    if [ -n "$target" ] && [ -d "$target" ]; then
      cd "$target"
      echo "📍 Entered room: $3 → $target"
    else
      command memsudo "$@"
    fi
  else
    command memsudo "$@"
  fi
}
