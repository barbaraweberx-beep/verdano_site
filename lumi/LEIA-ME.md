# LUMI – O Código da Luz · MVP jogável

Mini game web mobile-first para o **Festival Iguassu Inova 2026**. Não precisa de instalação nem de login, e funciona offline depois do primeiro carregamento.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O jogo completo: telas, arcade, QR, memória, ranking, recompensa e feedback |
| `jsQR.js` | Leitor de QR Code que roda no próprio aparelho, sem chamar servidor |
| `sw.js` + `manifest.json` + `icon-*.png` | PWA: cache offline e opção "adicionar à tela inicial" |
| `supabase.sql` | Banco de dados (tabelas, ranking, missão coletiva, indicadores, segurança) |
| `qrcodes-estacoes.pdf` | Os 4 QR Codes, em A4, prontos para imprimir |
| `lumi-teste-arquivo-unico.html` | Versão de arquivo único para abrir direto no celular ou no PC e testar |

## Teste rápido (2 minutos)

1. Abra `lumi-teste-arquivo-unico.html` no navegador.
2. Para registrar os fragmentos sem imprimir nada, digite os códigos manuais na tela do QR: **7Q2X**, **K4M9**, **P8W3**, **Z6H1**.
3. Você também pode abrir o PDF de QR Codes em outra tela e escanear. A câmera só abre com HTTPS (veja o próximo item).
4. No PC, use as setas ↑ ↓ para voar e as teclas 1–4 para as habilidades.

## Publicar (HTTPS é obrigatório para a câmera)

Envie a pasta inteira (sem o arquivo de teste) para um serviço gratuito de hospedagem estática, como **Netlify Drop**, **Vercel**, **GitHub Pages** ou **Cloudflare Pages**. Eles já oferecem HTTPS. O endereço gerado vira o link do jogo, e você pode colocá-lo num QR Code de entrada no festival.

Dica: se você quiser que a câmera nativa do celular já abra o jogo e registre o fragmento, gere os QR das estações com o link no formato `https://SEU-ENDERECO/?c=LUMI-DESCOBERTA-7Q2X`. O jogo aceita esse formato e também o código puro.

## Ativar o ranking global e a missão coletiva (Supabase, ~10 min)

1. Crie um projeto gratuito em supabase.com.
2. Abra o **SQL Editor**, cole todo o `supabase.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon public*.
4. No `index.html`, procure `CONFIG` no início do script e preencha:
   `supabase: { url: 'https://xxxx.supabase.co', anonKey: 'eyJ...' }`

Enquanto isso não estiver configurado, o jogo funciona inteiro, mas em modo local: o ranking mostra só o aparelho e a missão coletiva mostra "aguardando sincronização". Nenhum número é inventado.

**Indicadores de engajamento:** no Supabase, consulte as visões `v_indicadores`, `v_descobertas_por_mundo`, `v_descobertas_por_hora` e `v_comentarios`. Elas trazem o total de jogadores, a taxa de conclusão, as descobertas por mundo, as médias do arcade, a participação no Código das Piscadas, a nota média, os comentários e o número de adesivos entregues.

## Trocar mundos, códigos e metas

Tudo fica no bloco `CONFIG`, no início do script do `index.html`: o nome do mundo, o fragmento, o código do QR, o código curto, a cor e a frase do Lumi. A lógica do jogo usa só o `id` (`mundo1`…`mundo4`). Se mudar códigos ou nomes, atualize também o `insert into estacoes` do SQL e gere novos QR Codes. Ali também ficam a meta coletiva (500), a duração dos voos e o evento.

## Identidade visual (Vagalumen)

- Fundo `#2a0e36`, título em **Lutfey Arabic** na cor `#e8e0d4` e subtítulos em Verdana. A mascote é a arte oficial da Lumi.
- **Fonte Lutfey Arabic:** é uma fonte paga, então não foi incluída no pacote. Coloque o arquivo licenciado em `fonts/LutfeyArabic.woff2` (ou `fonts/LutfeyArabic.otf`) e o jogo passa a usá-la sozinho. Enquanto o arquivo não estiver lá, o jogo usa a Fredoka, uma fonte gratuita e arredondada parecida.
- Rodapé "powered by Verdano" e contato da Verdano na tela final de agradecimento.

## Regras implementadas

- Energia: começa em 10% e sobe 22,5% por fragmento, até 100%. O arcade não altera a energia.
- Pontos: 100 por fragmento, mais 100 de bônus ao completar os 4. Minijogos (cada um é jogado uma vez só): o **Código das Piscadas** é liberado no 1º fragmento e vale 50 por sequência, mais 50 de bônus pelos 3 níveis. O **Apague o Excesso** é liberado no 2º fragmento e vale +5 por lâmpada apagada e −10 por vagalume tocado. Somam-se o primeiro voo e a melhor pontuação no Grande Voo.
- Ranking: ordena por pontuação total. No empate, fica à frente quem tem mais fragmentos (missão concluída) e depois quem fez mais pontos no Grande Voo.
- A mesma estação não pontua duas vezes, nem no aparelho nem no banco (chave única jogador+estação).
- Missão cumprida: ao unir os 4 fragmentos, abre a tela de missão cumprida com o adesivo. Ela pode ser reaberta a qualquer momento pelo botão no painel.
- Recompensa: liberada com os 4 fragmentos, sem pontuação mínima. A tela tem relógio ao vivo e código de verificação (GL-XXXX), o que dificulta print reaproveitado. A equipe registra a entrega com dois toques em "Equipe: registrar entrega".
- Offline: o progresso e uma fila de sincronização ficam no aparelho e são enviados quando a internet volta.
- Modo estande: Ajustes (⚙) → "Iniciar novo jogador", para usar um tablet de demonstração.

## Limites conhecidos do MVP

- Como o jogo não tem login, a chave pública permite que alguém com conhecimento técnico forje pontuações. Para um evento demonstrativo isso é aceitável. Numa versão comercial, a validação deve ir para uma Edge Function.
- O progresso fica no navegador. Se a pessoa limpar os dados do navegador ou trocar de aparelho, recomeça.
