# Esfiharia Jataí — site de pedidos

Site para o cliente montar o pedido de esfihas e bebidas, escolher o horário da retirada
e enviar tudo pronto para o WhatsApp da loja. Inclui um painel com login onde o dono
cadastra, edita e remove produtos, com foto, descrição e preço.

**Somente retirada no local. Não há entrega nem pagamento pelo site** — o pagamento é
combinado no WhatsApp ou feito no balcão.

---

## Como rodar no seu computador

Você precisa do [Node.js](https://nodejs.org) 20 ou mais novo instalado.

```bash
npm install     # instala tudo (só na primeira vez)
npm start       # liga o site
```

Depois abra no navegador:

| Página | Endereço |
| --- | --- |
| Site do cliente | http://localhost:3000 |
| Painel do administrador | http://localhost:3000/admin |

### Primeiro acesso ao painel

Na primeira vez que o site sobe, ele cria o administrador e **mostra a senha no terminal**:

```
  Acesso do administrador criado:
    usuário: admin
    senha:   xK7pQm2v
```

Anote essa senha, entre no painel e troque em **Minha conta → Alterar senha**.

Se quiser definir a senha desde o começo, crie um arquivo `.env` (copie de `.env.example`)
com `ADMIN_PASSWORD=suasenha` **antes** de rodar `npm start` pela primeira vez.

**Esqueceu a senha?** Rode no terminal:

```bash
npm run reset-admin -- novaSenha123
```

---

## O que dá para fazer no painel

### 🥟 Produtos
Cadastrar esfihas e bebidas com **foto, nome, descrição, preço, unidade de venda e
categoria**. A foto é reduzida automaticamente no navegador antes do envio, para o
cardápio carregar rápido no celular do cliente.

O botão verde de cada produto liga e desliga a disponibilidade: desligado, o item some
do cardápio sem ser apagado — útil para o sabor que acabou hoje e volta amanhã.

### 🗂️ Categorias
Organizam o cardápio (Esfihas Salgadas, Esfihas Doces, Bebidas…). Cada uma tem um emoji
e uma ordem de exibição.

### 🏪 Loja e horários
- Nome, frase de apresentação, endereço da retirada e aviso no topo do cardápio
- **WhatsApp que recebe os pedidos**
- Horário de funcionamento de cada dia da semana (com dias fechados)
- **Tempo mínimo de preparo** — o cliente não consegue marcar um horário antes disso
- **Intervalo entre horários** — de quantos em quantos minutos aparecem as opções
- **Antecedência máxima** — até quantos dias à frente dá para agendar
- **Pedido mínimo** (opcional)

### 🔒 Minha conta
Troca de senha do painel.

---

## Como chega o pedido

O cliente monta o carrinho, escolhe dia e horário, informa nome e telefone e clica em
**Enviar pedido pelo WhatsApp**. Abre a conversa com a loja já com a mensagem pronta:

```
*NOVO PEDIDO — Esfiharia Jataí*

*Cliente:* Maria Silva
*WhatsApp:* (15) 98888-7777

*Itens do pedido:*
• 3x Esfiha de Carne — R$ 24,00
• 1x Coca-Cola Lata 350ml — R$ 6,00

*Total: R$ 30,00*

*Retirada no local:* Hoje, 20/08 às 19:00
*Pagamento:* a combinar (Pix pelo WhatsApp ou na retirada)

*Observações:* Sem cebola na de carne, por favor.
```

Só falta apertar enviar. O número que recebe é o configurado em **Loja e horários**.

> O horário só é confirmado quando você responder o cliente no WhatsApp. O site não
> reserva nada sozinho.

---

## Publicar na internet

O site é um servidor Node comum, roda em qualquer hospedagem que aceite Node.js
(Render, Railway, Fly.io, uma VPS com Nginx…).

```bash
npm install --omit=dev
NODE_ENV=production PORT=3000 npm start
```

**O único cuidado importante:** a pasta `data/` guarda o banco de dados e as fotos dos
produtos. Ela precisa ficar em um **disco persistente**, que não seja apagado a cada
atualização do servidor — senão o cardápio volta ao exemplo inicial. Use a variável
`DATA_DIR` para apontar para esse disco.

Fazer backup do site é copiar a pasta `data/`.

### Variáveis de ambiente

Todas são opcionais. Veja `.env.example` para a lista completa.

| Variável | Para que serve |
| --- | --- |
| `PORT` | Porta do servidor (padrão `3000`) |
| `DATA_DIR` | Onde ficam o banco e as fotos (padrão `./data`) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Acesso do primeiro administrador |
| `NODE_ENV` | Use `production` no site publicado |
| `SECURE_COOKIES` | `true` em sites com HTTPS, `false` em http:// |
| `TRUST_PROXY` | `1` quando o site está atrás de proxy reverso |

---

## Como o projeto está organizado

```
server/
  index.js          servidor, rotas de login e arranque
  db.js             banco SQLite, tabelas e configurações da loja
  auth.js           sessões, senha e proteção das rotas do painel
  seed.js           cardápio de exemplo da primeira execução
  reset-admin.js    redefine a senha pelo terminal
  routes/
    public.js       cardápio que o site do cliente consome
    admin.js        produtos, categorias, fotos e configurações

public/
  index.html        site do cliente
  admin.html        painel do administrador
  css/              estilos
  js/
    app.js          cardápio, carrinho e checkout
    admin.js        painel
    cart.js         carrinho salvo no navegador
    schedule.js     cálculo dos horários de retirada
    utils.js        formatação de dinheiro, telefone e chamadas à API

data/               banco de dados e fotos (não vai para o Git)
```

Tecnologias: **Node.js + Express + SQLite**, e o site em HTML, CSS e JavaScript puro.
Não há passo de build: editou o arquivo, atualizou a página.

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm start` | Liga o site |
| `npm run dev` | Liga reiniciando sozinho a cada alteração |
| `npm run seed` | Insere o cardápio de exemplo (só se o banco estiver vazio) |
| `npm run reset-admin -- novaSenha` | Redefine a senha do administrador |
