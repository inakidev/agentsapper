# agentsapper — Project Brief

> **Desvíos respecto del plan:** este brief es el plan original y no se reescribió. Los cambios que se hicieron durante la implementación (catálogo, severidades y proceso) y sus motivos están en [DEVIATIONS.md](DEVIATIONS.md).

> **Sobre el nombre:** un *sapper* (zapador) es el ingeniero militar que limpia el camino de minas antes de que avance la tropa. `agentsapper` limpia el repo antes de que entre el agente. Al 28/10/2026 el nombre estaba libre en npm y sin repos homónimos en GitHub. Conviene reservarlo pronto: crear el repo y publicar en npm una versión `0.0.1` placeholder.

## 1. Qué es

`agentsapper` es una CLI que se corre **antes** de abrir un repositorio no confiable con un agente de código (Claude Code, Codex, Cursor, Gemini CLI, etc.). Detecta si el repo puede ejecutar algo por su cuenta o manipular al agente.

El problema que ataca es este. Los agentes de código ejecutan git y leen archivos de configuración del proyecto apenas abren un directorio. Varias investigaciones de 2026 demostraron que esos archivos, escritos por el autor del repo y no por el desarrollador que lo abre, alcanzan para ejecutar comandos fuera del sandbox y sin pasar por la aprobación del usuario:

- GitSpawn, con `core.fsmonitor` en `.git/config`.
- La variante de GitLab, con filtros y drivers en `.gitattributes`.
- GhostApproval, con symlinks fuera del workspace.
- Hooks de configuración de agentes.

## 2. Tesis del proyecto (la que va al README y al post)

La mayoría de estos ataques no necesitan engañar al modelo: explotan la frontera de confianza entre el agente y las herramientas que invoca. Por eso se mitigan con **controles deterministas clásicos**, sin agregar más IA. La herramienta no usa ningún LLM y eso es una decisión de diseño, no una limitación.

## 2b. Trabajo relacionado y diferencial

Existe [repo-airlock](https://github.com/ankitsxchdeva/repo-airlock) (julio de 2026), con una propuesta parecida: un triage de solo lectura de repos no confiables antes de abrirlos con un agente. Es un script de bash de unas 120 líneas que busca, con grep, hooks de git, `.vscode/tasks.json`, `CLAUDE.md`/`.cursorrules`, `.mcp.json`, scripts de instalación, patrones de exfiltración y Unicode oculto.

Lo que **no** cubre y es el foco de `agentsapper`:

- **La capa de Git:** `.git/config` (`core.fsmonitor` y el resto de las claves ejecutables), filtros y drivers de `.gitattributes`, `include`/`includeIf` y `.git` como archivo `gitdir`. Es la familia de vulnerabilidades GitSpawn y DeepSeek-Reasonix (septiembre y octubre de 2026).
- **Symlinks** que escapan del workspace (GhostApproval).
- **Análisis estructurado en lugar de grep:** un parser real de git config y la correlación entre config y atributos.
- **Corpus de pruebas y evaluación medida:** detección por regla y tasa de falsos positivos sobre repos reales.
- **Integración con CI:** salida SARIF y exit codes.

Posicionamiento para README y post: *"Most untrusted-repo checks look at what the agent reads. agentsapper also covers what git executes when the agent merely looks."*

En el README, mencionar repo-airlock como trabajo relacionado, con respeto y explicando qué agrega este proyecto.

## 3. Principios de diseño (no negociables)

1. **Nunca ejecutar nada del repo analizado.** Esto incluye **no invocar el binario `git`** sobre el repo, porque correr `git status` es justamente lo que dispara el ataque. El `.git/config` se parsea a mano, con un parser INI propio que soporte la sintaxis de git (secciones con subsección, continuaciones, comillas, `include`/`includeIf`).
2. **Nunca seguir symlinks** al recorrer el árbol. Usar `lstat` y no `stat`, y resolver los destinos solo para analizarlos, nunca para leerlos.
3. **Cero dependencias de runtime** (o mínimas y justificadas). Es una herramienta de seguridad de supply chain, así que tiene que predicar con el ejemplo. Las dependencias de desarrollo están permitidas.
4. **Solo lectura.** No modifica el repo analizado.
5. **Determinista y explicable.** Cada hallazgo indica la regla, el archivo, la línea, la severidad, por qué es peligroso y qué hacer.
6. **Límites de recursos.** Tope de tamaño de archivo leído, tope de profundidad y timeout, para que un repo hostil no pueda colgar el scanner.

## 4. Stack

- Node.js 20+ con TypeScript estricto.
- Distribución como CLI vía `npx agentsapper <path>`.
- Tests con Vitest.
- ESLint y Prettier.
- CI con GitHub Actions: tests, lint y un self-scan del propio repo.

## 5. Catálogo de reglas (v1)

> **Importante para el agente:** las rutas y formatos de configuración de cada agente de IA cambian seguido. Antes de implementar cada regla de la familia AGENT, verificar el formato actual en la documentación oficial de cada herramienta y dejar el link en un comentario de la regla.

### GIT — configuración de Git que ejecuta comandos

| ID | Qué detecta | Severidad base |
|---|---|---|
| GIT-001 | `core.fsmonitor` definido en `.git/config` local (cualquier valor que no sea booleano) | critical |
| GIT-002 | Claves que nombran ejecutables: `core.pager`, `core.editor`, `core.sshCommand`, `core.askPass`, `core.hooksPath`, `diff.external`, `gpg.program`, `gpg.*.program`, `credential.helper`, `sequence.editor`, `pager.<cmd>` | high/critical según la clave |
| GIT-003 | Drivers: `filter.<x>.clean`, `filter.<x>.smudge`, `filter.<x>.process`, `diff.<x>.textconv`, `diff.<x>.command`, `merge.<x>.driver` | high |
| GIT-004 | `.gitattributes`, `.git/info/attributes` o archivos anidados que referencian drivers definidos en config (correlacionar con GIT-003: el riesgo real es la combinación) | high |
| GIT-005 | `include.path` / `includeIf` que apuntan a archivos dentro del repo (config indirecta, que se analiza recursivamente) | high |
| GIT-006 | Hooks ejecutables reales en `.git/hooks/` (que no sean `.sample`) o `core.hooksPath` apuntando dentro del repo | medium/high |
| GIT-007 | `.git` como archivo (`gitdir: ...`) o symlink que apunta fuera del repo | high |

Verificar la lista completa de claves contra la documentación de `git-config` y `gitattributes` y documentar las que se agreguen.

### FS — sistema de archivos

| ID | Qué detecta | Severidad base |
|---|---|---|
| FS-001 | Symlink cuyo destino resuelve fuera de la raíz del repo | high |
| FS-002 | Symlink hacia rutas sensibles (`~/.ssh`, `~/.aws`, `~/.config`, `/etc`, etc.) | critical |
| FS-003 | Symlinks dentro de directorios de configuración de agentes o IDE | high |

### AGENT — configuración de agentes de IA

| ID | Qué detecta | Severidad base |
|---|---|---|
| AGENT-001 | Claude Code: `.claude/settings.json` y `.claude/settings.local.json` con `hooks`, permisos amplios (por ejemplo, Bash sin restricción) o `env` sospechoso | critical/high |
| AGENT-002 | Servidores MCP definidos en el repo (`.mcp.json`, `.cursor/mcp.json` y equivalentes) que lanzan comandos locales (`command`) | high |
| AGENT-003 | Configs de otros agentes (Cursor, Gemini CLI, Codex, Copilot), con la ruta y el formato verificados según la nota de arriba | medium/high |

### INSTR — archivos de instrucciones (prompt injection)

Aplica a `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.cursor/rules/*`, `.github/copilot-instructions.md` y, con menor severidad, a `README.md`.

| ID | Qué detecta | Severidad base |
|---|---|---|
| INSTR-001 | Caracteres Unicode invisibles: tag characters (U+E0000–U+E007F), zero-width (U+200B–U+200D, U+2060, U+FEFF) y controles bidi (U+202A–U+202E, U+2066–U+2069). Reportar la posición y **decodificar el texto oculto** en el output | critical |
| INSTR-002 | Comentarios HTML (`<!-- -->`) o bloques colapsados con contenido imperativo dirigido al agente | medium |
| INSTR-003 | Patrones de ejecución remota en instrucciones: `curl … \| sh`, `wget`, `eval`, blobs base64 largos | high |

Las heurísticas de INSTR-002 y INSTR-003 van a tener falsos positivos. Documentarlas como señales para revisar, no como veredictos.

### IDE / PKG — otras vías de autoejecución

| ID | Qué detecta | Severidad base |
|---|---|---|
| IDE-001 | `.vscode/tasks.json` con `runOptions.runOn: "folderOpen"` | high |
| IDE-002 | `.devcontainer/` con `postCreateCommand`, `postStartCommand` o `initializeCommand` | medium |
| PKG-001 | `package.json` con scripts de ciclo de vida (`preinstall`, `install`, `postinstall`, `prepare`). Sube a high si contienen descarga, `eval` o base64 | info → high |

## 6. CLI

```
agentsapper <path> [--format text|json|sarif] [--fail-on low|medium|high|critical] [--rules GIT,FS,...] [--quiet]
```

- Exit code `0` si no hay hallazgos iguales o superiores a `--fail-on` (por defecto `high`). Exit code `1` si los hay. Exit code `2` ante un error de ejecución.
- La salida de texto agrupa por severidad. Cada hallazgo muestra la regla, el archivo:línea, un fragmento, la explicación y la recomendación.
- SARIF sirve para integrarse con GitHub Code Scanning (fase 5).

## 7. Corpus de pruebas

Es el diferencial del proyecto: cada regla se valida contra un repo malicioso que reproduce una técnica publicada.

### Regla crítica de seguridad para el desarrollo

**Los fixtures maliciosos no se guardan materializados en el working tree.** Se guardan como especificaciones (por ejemplo, `fixtures/specs/git-001-fsmonitor.ts`) y un generador los crea en un directorio temporal al momento del test, y los borra después. Hay dos razones:

1. Un `.git/` anidado no se puede commitear normalmente.
2. **El propio agente que desarrolla este proyecto podría disparar los fixtures** si existieran como repos reales en el directorio de trabajo.

### Payloads

Siempre inofensivos: escribir un archivo marcador en el directorio temporal del test (por ejemplo, `echo pwned > $TMP/marker`). Nada de red, nada fuera del tmp.

### Composición

- **Maliciosos:** al menos un fixture por regla, más combinaciones (por ejemplo, filtro en config con su atributo en `.gitattributes`). Cada spec lleva un campo `source` con el link a la investigación que reproduce.
- **Benignos (control de falsos positivos):** clones superficiales de repos populares reales y legítimos (por ejemplo, proyectos conocidos de Node y Python que usan husky, devcontainers y scripts `prepare`). Los clones viven fuera del repo y se descargan con un script.
- **Prueba de explotabilidad (opcional, fase 6):** un script que, **dentro de un contenedor Docker descartable**, materializa un fixture, corre `git status` y verifica que aparece el marcador. Eso demuestra que el fixture es realmente explotable. Después corre `agentsapper` y verifica que lo detecta.

## 8. Fases

| Fase | Entregable | Criterio de terminado |
|---|---|---|
| F0 | Setup: TypeScript, Vitest, lint, CI, estructura de reglas pluggable (interfaz `Rule` → `Finding[]`) | CI en verde con un test dummy |
| F1 | Parser de git config propio + reglas GIT-001 a GIT-007 + generador de fixtures | Todos los fixtures GIT detectados y tests del parser con casos borde de sintaxis |
| F2 | Walker de filesystem seguro + reglas FS | Symlinks detectados sin seguirlos; test con symlink circular |
| F3 | Reglas AGENT e INSTR (con decodificación de texto oculto) | Fixtures detectados; formatos verificados con links en el código |
| F4 | Reglas IDE y PKG | Fixtures detectados |
| F5 | Salida JSON y SARIF, `--fail-on`, exit codes, publicación en npm | `npx agentsapper` funciona en limpio |
| F6 | Evaluación: corrida contra el corpus completo y los benignos, y tabla de resultados | README con detección por regla y tasa de falsos positivos |

Estimación: entre una y dos semanas a ritmo de proyecto paralelo.

## 9. Fuera de alcance (v1)

- Cualquier uso de LLM.
- Remediación automática o "limpieza" del repo.
- Sandboxing o ejecución aislada del agente.
- Análisis de dependencias transitivas o de vulnerabilidades en paquetes (eso ya lo hacen otras herramientas).
- Plugin para IDE o hook automático en los agentes (posible v2).

## 10. README final (estructura)

1. Una línea sobre qué es, más un GIF de una corrida.
2. El problema, en tres párrafos, con links a las investigaciones originales.
3. Instalación y uso.
4. Tabla de reglas.
5. **Resultados de la evaluación** (detección y falsos positivos) y **limitaciones conocidas**, contadas con honestidad.
6. Modelo de amenazas: qué cubre y qué no.
7. Trabajo relacionado (repo-airlock y otros) y en qué se diferencia.
8. Las referencias.

## 11. Referencias

- CSA, GitSpawn: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-git-config-rce-20260904-cs/
- GitLab, DeepSeek-Reasonix (gitattributes y otras claves): https://about.gitlab.com/blog/deepseek-reasonix-vulnerability-discovered
- Adversa AI, resumen de octubre de 2026: https://adversa.ai/blog/top-ai-coding-agent-security-resources-october-2026/
- Adversa AI, resumen de agosto de 2026 (GhostApproval, symlinks): https://adversa.ai/blog/top-ai-coding-agent-security-resources-august-2026/
- CSA, secretos de CI/CD y GuardFall: https://labs.cloudsecurityalliance.org/research/csa-research-note-ai-coding-agent-cicd-secrets-20260808-csa/

## 12. Instrucciones para el agente que implementa

- Trabajar fase por fase. Al terminar cada una, mostrar un resumen y esperar confirmación antes de seguir.
- TDD: primero la spec del fixture y el test, después la regla.
- No ejecutar `git` ni ningún script dentro de directorios de fixtures materializados.
- Si un formato de configuración de un agente no se puede verificar en la documentación oficial, marcar la regla como `experimental` y avisar.
- Código, comentarios, mensajes de CLI y README en inglés.
