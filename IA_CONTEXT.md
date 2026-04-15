📜 VTT MASTER ARCHITECTURE & CONTEXT LEDGER
🏗️ 1. Sistema de Cenas e Persistência
Estrutura: O sistema é baseado em scenes. Cada cena possui um background_image, grid_size e seu próprio conjunto de tokens.

Névoa de Guerra (Fog of War): - Lógica: Baseada em um Canvas oculto. O estado da névoa é salvo como uma string Base64 no banco de dados (scenes.fog_data).

Persistência: Sempre que o mestre desenha/apaga névoa, o Base64 é atualizado via POST /scenes/:id/fog.

Renderização: No carregamento, o Base64 é desenhado em um canvas temporário e aplicado sobre o mapa com o modo de mesclagem destination-out.

📦 2. Sistema de Galeria (Templates) - O "Blueprint"
Tabela token_templates: Armazena os modelos de criaturas.

Campos do Template: - name, image_url, size (1x1, 2x2, etc).

sheet_data: Objeto JSON completo contendo stats, auras, ataques e perícias.

Interface da Galeria:

Visualização: Cards com a imagem do token.

Edição de Ficha: Botão que abre o sheet.js em modo "template", salvando diretamente na tabela de modelos.

Fluxo de Instanciação: - O ato de clica na opção "Colocar no mapa" em um template adiciona um clone profundo. O novo token no mapa recebe uma cópia idêntica do sheet_data do template, mas com um novo id na tabela tokens.

⚔️ 3. Sistema de Tokens (Instâncias no Mapa)
Tabela tokens: Registra a posição (x, y), a cena pertencente e o estado atual.

Ficha Individual: Cada token no mapa tem sua própria ficha. Alterar o HP de um "Goblin 1" no mapa não altera o "Goblin 2" nem o Template original.

Renderização (tabletop.js):

Barra de Vida: Dinâmica, calculada via sheet_data.hp_current / sheet_data.hp_max. Visível apenas no hover.

Condições (Badges): Ícones pequenos renderizados sobre o token baseados no array sheet_data.conditions.

Auras: Círculos coloridos sob o token. O raio é lido de sheet_data.auras.

🎲 4. Utilitários (Dados e Notas)
Rolagem de Dados:

Funciona via botão no menu lateral esquerdo, com as opções de d4, d6, d8, d10, d12 e d20.

Lógica: Math.floor(Math.random() * faces) + 1.

Sistema de Notas:

Notas rápidas salvas globalmente, persistidas em texto simples no banco de dados.

📐 5. Ferramentas Táticas e Medição
Modos de Medição: Linha, Cone e Círculo.

Cálculo de Borda: Em tokens de tamanho > 1x1, a ferramenta identifica a extremidade mais próxima do clique para iniciar a medição (evita erro de origem no centro).

Grid Highlighting: O sistema itera sobre as células da grid. Se o ponto central da célula estiver dentro da área geométrica, a célula recebe um preenchimento rgba(255, 0, 0, 0.3).

🛠️ 6. Motor de Fichas (sheet.js) e Automação
Single Source of Truth (SSoT): Tudo (HP, Atributos, Auras) está dentro do JSON sheet_data.

Automação de Atributos: - Modificadores são calculados em tempo real: (Stat - 10) / 2.

Perícias e Saves travados: Modificador + Proficiência.

Sincronização: O sheet.js utiliza window.parent ou eventos globais (window.updateTokenStats) para avisar ao tabletop.js que algo mudou (ex: HP caiu, a barra de vida no mapa deve atualizar na hora).

🚫 7. Regras de Ouro para Desenvolvimento (Guardrails)
Não misturar escopos: Nunca tente salvar dados de um Token na rota de Templates.

Respeitar o Zoom/Pan: Todas as coordenadas de desenho (ctx.arc, ctx.rect) devem considerar cam.x, cam.y e cam.scale.

Múltiplos de 5: Todas as ferramentas de range e movimentação devem respeitar o padrão de 5ft do D&D 5e.

Preservação de Névoa: Qualquer alteração no tabletop.js não deve resetar ou limpar o canvas da Névoa de Guerra sem comando explícito.