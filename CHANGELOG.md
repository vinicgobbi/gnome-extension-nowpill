## v0.2.0 (2026-10-31)

### Feat

- a pílula não corta mais o texto com "..."; a cada novidade (player novo, troca de faixa) o nome passa inteiro uma vez, rolando de lado, e depois fica no início com um fade onde é cortado
- ondas na base da pílula de música da tela de bloqueio, de ponta a ponta, como no One UI (ondulam tocando, afundam pausada); o desenho das ondas fica compartilhado com a barra de progresso
- pílula na tela de bloqueio, no topo e maior; um clique abre o card como no One UI (relógio encolhe para cima, capa grande, controles embaixo), sem nada que abra apps até desbloquear; opção para desligar
- pílula de música só com o nome da música; o artista fica no card do popup
- pílula sem linha de progresso em todas as atividades, que fica só no popup; sai a opção "Progress line" das preferências e a chave show-progress
- pílula do clima na cor do céu (laranja com sol, azul à noite e com chuva, roxo com tempestade, cinza com neblina, no mesmo tom mais fundo da pílula de música), com ícone e texto em branco
- pílula de música na cor de destaque da capa (o mesmo tom mais fundo, para encher a pílula, com texto branco ou preto conforme leia melhor, clareando sob o mouse e com o popup aberto) e com o ícone do app que está tocando em vez do equalizador: o simbólico quando o tema tem, senão o colorido pintado numa cor só; sem linha de progresso, que fica no popup; app achado também pelo nome do player (o Spotify em Flatpak se anuncia como "spotify")
- card de mídia no estilo da One UI 9: capa cobrindo o card sob um véu escuro (texto branco sobre ela também no tema claro); "título • artista" numa linha que rola quando não cabe; barra de progresso reta com morros translúcidos em três camadas sobre o trecho tocado, que nascem no começo, crescem até o meio e somem na bolinha, mais altos e menos divididos no início da faixa e assentando ao pausar; controles shuffle, anterior, play, próxima e repeat em círculos do mesmo tamanho, com ±10 s nas teclas [ e ]
- card de mídia com as cores da capa: fundo em degradê no tom dela (ajustado ao tema claro ou escuro), barras de seek e volume, play, shuffle e repeat no destaque da capa com ícone legível sobre ele; app que está tocando (ícone e nome) no topo do card, que abre o player; anterior e próxima ficam no lugar, apagados quando indisponíveis; capa esmaecida quando pausado, tempos sob a barra, ícone do volume acompanhando o nível
- preferências em Adwaita: atividades exibidas, quanto tempo um player pausado fica na pílula, players detectados com chave para esconder, posição e largura da pílula, o que mostrar sem atividades, marcador 2/4, cores da capa, animações e unidade do clima com atalho para o GNOME Clima
- pílula no painel e popup em carrossel: scroll troca de atividade (um passo por clique da roda, inércia do touchpad contida), clique do meio roda a ação principal e o direito esconde; cards de mídia com capa, seek, controles redondos e volume, de clima com próximas horas e 3 dias, e genérico para o resto; animações (equalizador enquanto toca, troca de atividade e de faixa deslizando, abertura do popup, pulso no que é urgente, progresso suave); tema claro e escuro, com a pílula se adaptando a painel claro
- interface D-Bus br.dev.vinicgobbi.NowBar (next, prev, toggle, focus, act, primary, dismiss, push, status...) no lugar do IPC do Omarchy, com bin/nowbar e bin/nowbar-run para mostrar qualquer comando na pílula
- serviço que junta as fontes numa lista de atividades e decide o foco (porte do Service.qml): novidades mais importantes tomam a pílula, troca manual pausa isso por alguns segundos, player pausado cede a pílula depois de um tempo, atividades escondidas voltam quando mudam, ações de cada card
- fontes nativas do GNOME: players MPRIS por D-Bus, bateria pelo UPower e power-profiles-daemon, Não perturbe e luz noturna pelas configurações do GNOME, microfone pelo mixer do Shell e câmera pelo Shell.CameraMonitor, gravação e screenshot pela ferramenta de captura do Shell, clima pelo WeatherClient (GWeather, o mesmo do menu do calendário) mantendo a última leitura quando a localização oscila; capas validadas (https público ou arquivo local, tamanho, assinatura e dimensões) com cor de destaque tirada da capa; glifos Nerd Font do modelo mapeados para ícones simbólicos
- modelo compartilhado com o omarchy-plugin-nowbar (NowbarModel.js copiado sem alterações e exportado como ES module por tools/sync-model.sh; prioridades, foco, atividades e push são a mesma lógica do plugin) e testes do modelo no GJS

### Fix

- sem nada acontecendo a pílula some em vez de mostrar "..."; a pílula vazia fica só para quem escolher essa opção
- clima não aparece mais como "Unknown" na pílula; a descrição vem das condições, do céu só quando ele é informado, ou do ícone, e na falta de tudo fica só a temperatura
- capas remotas (Spotify) voltam a carregar: o tipo da imagem era lido com GLib.Bytes.new_from_bytes, que não existe no GJS, e toda capa baixada falhava
- com "Scripts" desligado nas opções, o Push pelo D-Bus é recusado e os pushes que havia são apagados (antes eram guardados e mantinham o relógio de 1 s ligado)
- card de câmera e microfone não some mais com a tecla x no popup: a regra de não escondê-lo fica no serviço e vale para o teclado, o clique direito e o D-Bus
- capas baixadas com mais segurança e sem travar o Shell: o download para assim que passa de 8 MB (antes a resposta inteira ia para a memória antes da checagem); o endereço é checado na hora da conexão e de novo na resposta, contra um nome que resolve para a rede local na segunda vez (fora quando há proxy); arquivo gravado como 0600; leitura e decodificação assíncronas; capa que falhou é tentada de novo após 60 s, e o cache deixa por último a que está na tela
- barra de tempo não some ao buscar num vídeo do Firefox: depois de um seek ele tira a duração dos metadados e responde posição 0 até o próximo play/pause; a mesma faixa mantém a última duração conhecida e a posição segue o sinal Seeked, contando o tempo tocado
- no popup, o ponto alongado do carrossel se estica até o card novo em vez de pular (um encolhe enquanto o outro cresce, a fileira não se mexe) e a altura acompanha o card novo suavemente em vez de saltar entre cards de tamanhos diferentes
- pílula muda de largura com animação ao trocar de atividade (do tamanho que tinha até o que o novo conteúdo pede, com o texto centralizado) e o popup aberto fica onde abriu em vez de ser arrastado para o lado quando a pílula muda de largura
- player que volta a tocar retoma a pílula: novidade que não pôde tomar a pílula (troca manual recente ou popup aberto) fica pendente e toma quando isso passa, em vez de ser dada como vista e nunca aparecer; e um player pausado em foco cede a pílula para outro que esteja tocando
- aviso de chuva vira uma faixa no card de clima (e "Rain soon" na pílula quando o clima é o que ela mostra) em vez de uma atividade própria: era um segundo card de clima e, com prioridade acima da mídia, segurava a pílula e impedia música e outras novidades de tomá-la, voltando a cada faixa de 3 h

### Refactor

- remove bin/nowbar e bin/nowbar-run, que não vão no pacote da extensão; o README passa a mostrar a interface D-Bus direto pelo gdbus

### Perf

- uma atualização por segundo enquanto toca (o tick espera as posições dos players em vez de atualizar de novo a cada resposta); metadados MPRIS desempacotados só quando mudam; lista de artistas limitada a 8
