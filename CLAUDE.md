# DevOps Manager — CLAUDE.md

## Projeto

Ferramenta de gerenciamento DevOps com backend FastAPI (Python) e frontend React (TypeScript).

- **Backend**: `backend/main.py` — FastAPI REST API
- **Frontend**: `frontend/src/` — React + TypeScript
- **Infraestrutura**: `docker-compose.yml`, `devops-manager.service`

---

## Sistema de Agentes — Antigravity Kit

**REGRA DE ORQUESTRAÇÃO E ROTEAMENTO (LEIA COM ATENÇÃO):**
Você é o Orquestrador deste projeto. Os arquivos abaixo NÃO devem ser carregados todos de uma vez. Quando o usuário fizer um pedido ou passar uma tarefa, você DEVE seguir este fluxo obrigatoriamente:
1. **Analise** a solicitação do usuário.
2. **Consulte** o mapa de Agentes, Skills e Workflows abaixo para identificar quais são os especialistas adequados para a tarefa.
3. **Leia ativamente (usando sua ferramenta de ler arquivos)** os `.md` do Agente e das Skills selecionadas ANTES de começar a responder ou codar.
4. **Assuma a persona** do agente carregado e execute a tarefa usando as diretrizes dele.

Exemplo: Se o usuário pedir "Crie a tela de login", você deve ler `.agent/agents/frontend-specialist.md` e `.agent/skills/tailwind-patterns/SKILL.md` silenciosamente e então iniciar o trabalho.

**INSTRUÇÃO DE SISTEMA:** NÃO carregue os arquivos abaixo automaticamente. Use esta lista apenas como um índice/mapa. Leia o conteúdo do arquivo de um agente, skill ou workflow **somente** quando a tarefa atual exigir essa especialização ou quando o usuário solicitar explicitamente.

### Regras Globais
.agent/rules/GEMINI.md

### Arquitetura
.agent/ARCHITECTURE.md

---

## Agentes (20)

.agent/agents/orchestrator.md
.agent/agents/project-planner.md
.agent/agents/frontend-specialist.md
.agent/agents/backend-specialist.md
.agent/agents/database-architect.md
.agent/agents/mobile-developer.md
.agent/agents/devops-engineer.md
.agent/agents/test-engineer.md
.agent/agents/security-auditor.md
.agent/agents/penetration-tester.md
.agent/agents/debugger.md
.agent/agents/performance-optimizer.md
.agent/agents/seo-specialist.md
.agent/agents/documentation-writer.md
.agent/agents/product-manager.md
.agent/agents/product-owner.md
.agent/agents/qa-automation-engineer.md
.agent/agents/code-archaeologist.md
.agent/agents/game-developer.md
.agent/agents/explorer-agent.md

---

## Skills (36)

.agent/skills/intelligent-routing/SKILL.md
.agent/skills/clean-code/SKILL.md
.agent/skills/behavioral-modes/SKILL.md
.agent/skills/parallel-agents/SKILL.md

### Frontend & UI
.agent/skills/nextjs-react-expert/SKILL.md
.agent/skills/web-design-guidelines/SKILL.md
.agent/skills/tailwind-patterns/SKILL.md
.agent/skills/frontend-design/SKILL.md

### Backend & API
.agent/skills/api-patterns/SKILL.md
.agent/skills/nodejs-best-practices/SKILL.md
.agent/skills/python-patterns/SKILL.md
.agent/skills/mcp-builder/SKILL.md

### Banco de Dados
.agent/skills/database-design/SKILL.md

### Mobile
.agent/skills/mobile-design/SKILL.md

### Game Development
.agent/skills/game-development/SKILL.md

### Infraestrutura & Cloud
.agent/skills/deployment-procedures/SKILL.md
.agent/skills/server-management/SKILL.md

### Testes & Qualidade
.agent/skills/testing-patterns/SKILL.md
.agent/skills/webapp-testing/SKILL.md
.agent/skills/tdd-workflow/SKILL.md
.agent/skills/code-review-checklist/SKILL.md
.agent/skills/lint-and-validate/SKILL.md

### Segurança
.agent/skills/vulnerability-scanner/SKILL.md
.agent/skills/red-team-tactics/SKILL.md

### Arquitetura & Planejamento
.agent/skills/architecture/SKILL.md
.agent/skills/app-builder/SKILL.md
.agent/skills/plan-writing/SKILL.md
.agent/skills/brainstorming/SKILL.md

### SEO & Growth
.agent/skills/seo-fundamentals/SKILL.md
.agent/skills/geo-fundamentals/SKILL.md

### Shell & CLI
.agent/skills/bash-linux/SKILL.md
.agent/skills/powershell-windows/SKILL.md

### Outros
.agent/skills/rust-pro/SKILL.md
.agent/skills/performance-profiling/SKILL.md
.agent/skills/systematic-debugging/SKILL.md
.agent/skills/documentation-templates/SKILL.md
.agent/skills/i18n-localization/SKILL.md

---

## Workflows (11)

.agent/workflows/brainstorm.md
.agent/workflows/create.md
.agent/workflows/debug.md
.agent/workflows/deploy.md
.agent/workflows/enhance.md
.agent/workflows/orchestrate.md
.agent/workflows/plan.md
.agent/workflows/preview.md
.agent/workflows/status.md
.agent/workflows/test.md
.agent/workflows/ui-ux-pro-max.md
