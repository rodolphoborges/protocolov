# Guia de Contribuição: Protocolo V

Obrigado por seu interesse em contribuir com o Protocolo V! Para manter a integridade tática do nosso código, seguimos diretrizes estritas.

## 🛠️ Fluxo de Trabalho de Branches

Trabalhamos com um fluxo baseado em branches de funcionalidade:

- `main`: Versão estável em produção.
- `feature/nome-da-feature`: Para novas funcionalidades.
- `fix/nome-do-bug`: Para correções de bugs.
- `docs/melhoria-documentacao`: Para atualizações técnicas de arquivos MD.

**Destaque:** Nunca envie commits diretamente para a branch `main`. Sempre abra um Pull Request (PR).

## 📝 Padrão de Commits (Conventional Commits)

Utilizamos o padrão [Conventional Commits](https://www.conventionalcommits.org/) para garantir um histórico claro e automatizável:

- `feat:` Uma nova funcionalidade (ex: `feat: adiciona comando /radar`).
- `fix:` Uma correção de bug (ex: `fix: corrige cálculo de ADR no Oráculo`).
- `docs:` Alterações na documentação.
- `style:` Alterações que não afetam o sentido do código (espaços, formatação, etc).
- `refactor:` Alteração de código que não corrige bug nem adiciona funcionalidade.
- `test:` Adição ou correção de testes.

## 🚀 Processo para Pull Requests

1. Faça o **Fork** do projeto.
2. Crie sua branch (`git checkout -b feature/minha-feature`).
3. Comite suas mudanças seguindo o padrão acima.
4. Certifique-se de que os testes estão passando (`npm test`).
5. Faça o **Push** para a branch (`git push origin feature/minha-feature`).
6. Abra um **Pull Request** detalhando o que foi alterado e por quê.

## 🧪 Testes

Se você adicionar uma nova lógica de cálculo ou um novo comando, **é obrigatório** incluir testes correspondentes na pasta `tests/`.

---
*Mantenha o padrão. Refforce o protocolo.*
