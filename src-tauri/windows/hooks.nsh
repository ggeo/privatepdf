!macro NSIS_HOOK_PREUNINSTALL
  ; Stop Ollama process if running
  nsExec::ExecToStack 'taskkill /F /IM ollama.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove PrivatePDF-managed Ollama installation
  RMDir /r "$LOCALAPPDATA\PrivatePDF\ollama"

  ; Remove the PrivatePDF folder itself (will only succeed if empty)
  RMDir "$LOCALAPPDATA\PrivatePDF"

  ; Remove Ollama models folder (hidden folder created by Ollama)
  RMDir /r "$LOCALAPPDATA\.ollama"
  RMDir /r "$PROFILE\.ollama"
!macroend
