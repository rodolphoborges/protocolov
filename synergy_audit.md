# Relatório de Auditoria de Sinergia - Protocolo-V

Data: 31/03/2026, 14:19:53
Operações Competitivas Analisadas: 228

| Status | Jogador | Sinergia Atual | Sinergia Calculada | Diferença | Partidas em Squad |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ❌ ERRO | m4sna#chama | 887 | 269 | -618 | 126 |
| ❌ ERRO | DefeitoDeFábrica#ZzZ | 796 | 222 | -574 | 100 |
| ❌ ERRO | ALEGRIA#021 | 900 | 202 | -698 | 85 |
| ❌ ERRO | mwzeraDaShopee#s2s2 | 752 | 197 | -555 | 89 |
| ❌ ERRO | ousadia#013 | 364 | 85 | -279 | 26 |
| ❌ ERRO | Vduart#MEE | 370 | 69 | -301 | 21 |
| ❌ ERRO | Pilako#3186 | 93 | 41 | -52 | 13 |
| ✅ OK | Camarada vituxo#1312 | 38 | 38 | 0 | 18 |
| ❌ ERRO | Ministro Xandao#peixe | 320 | 27 | -293 | 16 |
| ❌ ERRO | Mahoraga#Chess | 5 | 14 | +9 | 4 |
| ❌ ERRO | Fadinha Do FF#nobru | 2 | 6 | +4 | 2 |
| ✅ OK | TKBatata#JINX | 4 | 4 | 0 | 2 |
| ❌ ERRO | PDL CH1TUZ#666 | 1 | 4 | +3 | 1 |
| ✅ OK | kugutsuhasu#2145 | 0 | 0 | 0 | 0 |

## ⚠️ CONCLUSÃO: Foram encontradas divergências! 

Total acumulado de erro: **3386 pontos**.

### Possíveis causas:
1. **Operações Deletadas:** Se uma operação foi removida do banco mas os pontos permaneceram nos jogadores.
2. **Reset Parcial:** Se a tabela de jogadores foi resetada mas a de operações não.
3. **Erro no Upsert Antigo:** Se o sistema falhou ao atualizar a pontuação incrementalmente (ex: processou a partida mas não somou os pontos).
4. **Pontuação Manual:** Se alguém alterou o `synergy_score` diretamente no banco de dados.
