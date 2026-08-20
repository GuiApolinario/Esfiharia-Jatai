# Esfiharia Jataí — site de pedidos

Site para o cliente montar o pedido de esfihas e bebidas, escolher o horário da retirada
e enviar tudo pronto para o WhatsApp da loja. Tem um painel com login onde o dono
cadastra, edita e remove produtos, com foto, descrição e preço.

**Somente retirada no local. Não há entrega nem pagamento pelo site** — o pagamento é
combinado no WhatsApp ou feito no balcão.

**Endereço do site:** https://esfihariajatai.ggsistemas.dev.br

## Como funciona por dentro

O site é feito de arquivos estáticos (HTML, CSS e JavaScript) hospedados no **GitHub
Pages** — o mesmo esquema dos seus outros sites. Os produtos, as fotos e a senha do
painel ficam no **Supabase**, um banco de dados na nuvem com plano gratuito.

```
 Cliente  ──►  GitHub Pages (o site)  ──►  Supabase (produtos, fotos, login)
                                    │
                                    └──►  WhatsApp da loja (o pedido)
```

Não existe servidor para manter ligado nem mensalidade.

---

# Publicando o site — faça uma vez

São três etapas: criar o banco, ligar o site nele e apontar o domínio.

## Etapa 1 — Criar o banco no Supabase

1. Entre em **https://supabase.com** e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New project**:
   - **Name:** `esfiharia-jatai`
   - **Database Password:** gere uma senha forte e **guarde em lugar seguro**
   - **Region:** escolha `South America (São Paulo)`
3. Espere uns dois minutos até o projeto ficar pronto.
4. No menu lateral, abra **SQL Editor** e clique em **New query**.
5. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste repositório, copie
   **todo** o conteúdo, cole no editor e clique em **Run**.
   Isso cria as tabelas, as permissões, a pasta das fotos e um cardápio de exemplo.

### Criar o seu acesso ao painel

6. No menu lateral, vá em **Authentication → Users → Add user → Create new user**:
   - informe **o seu e-mail** e **uma senha** (mínimo 6 caracteres)
   - marque a opção **Auto Confirm User**
   - clique em **Create user**
7. Volte no **SQL Editor**, abra uma nova query e rode o comando abaixo,
   **trocando o e-mail pelo seu**:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com'
   on conflict (user_id) do nothing;
   ```

   Sem esse passo o login não funciona — é ele que diz quem pode mexer no cardápio.

### Fechar a porta de novos cadastros

8. Vá em **Authentication → Sign In / Providers → Email** e **desligue**
   a opção *Allow new users to sign up*.

   Isso impede que estranhos criem contas no seu projeto. Mesmo que alguém
   conseguisse, ainda não teria acesso ao painel (o passo 7 cuida disso), mas
   é bom fechar as duas portas.

## Etapa 2 — Ligar o site ao banco

9. No Supabase, vá em **Project Settings → API Keys** e copie dois valores:
   - **Project URL** — algo como `https://abcdefgh.supabase.co`
   - a chave pública **`anon`** — um texto bem longo
10. Neste repositório, abra o arquivo **`js/config.js`** e preencha:

    ```js
    export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
    export const SUPABASE_ANON_KEY = 'cole-aqui-a-chave-anon';
    ```

11. Salve e envie a alteração (`git commit` e `git push`, ou edite direto pelo site
    do GitHub no botão do lápis).

> **Esses dois valores podem ficar públicos no repositório.** A chave `anon` foi feita
> para isso: sozinha ela só deixa **ler** o cardápio. Quem decide o que pode ser
> alterado são as permissões criadas pelo `schema.sql`.
>
> A chave **`service_role`** é secreta e **nunca** deve entrar no repositório.

## Etapa 3 — Publicar no GitHub Pages

12. O código está na branch `claude/esfiharia-jatai-website-1wu0yy`. Junte na `main`
    (pelo botão **Compare & pull request** no GitHub, ou pelo terminal):

    ```bash
    git checkout main
    git merge claude/esfiharia-jatai-website-1wu0yy
    git push origin main
    ```

13. No repositório, vá em **Settings → Pages** e configure:
    - **Source:** `Deploy from a branch`
    - **Branch:** `main` e a pasta **`/ (root)`**
    - clique em **Save**

14. Ainda em **Settings → Pages**, no campo **Custom domain**, escreva
    `esfihariajatai.ggsistemas.dev.br` e clique em **Save**.

15. No painel do seu domínio, crie o registro DNS:

    | Tipo | Nome | Valor |
    | --- | --- | --- |
    | `CNAME` | `esfihariajatai` | `guiapolinario.github.io` |

16. Espere o DNS propagar (de alguns minutos a algumas horas). Quando o GitHub
    mostrar o cadeado verde, marque **Enforce HTTPS**.

Pronto. O site fica em **https://esfihariajatai.ggsistemas.dev.br** e o painel em
**https://esfihariajatai.ggsistemas.dev.br/admin.html**.

> O repositório precisa ser **público** para o GitHub Pages funcionar no plano
> gratuito. Não tem problema: as senhas ficam no Supabase, não no código.

---

# O dia a dia

## Entrar no painel

Acesse `/admin.html`, informe o e-mail e a senha que você criou no passo 6.

**Esqueceu a senha?** No Supabase, vá em **Authentication → Users**, clique nos três
pontinhos ao lado do seu usuário e escolha **Reset password** ou **Send magic link**.

## 🥟 Produtos
Cadastre esfihas e bebidas com **foto, nome, descrição, preço, unidade de venda e
categoria**. A foto é reduzida no navegador antes de subir, para o cardápio carregar
rápido no celular do cliente.

O botão verde de cada produto liga e desliga a disponibilidade: desligado, o item some
do cardápio sem ser apagado — útil para o sabor que acabou hoje e volta amanhã.

## 🗂️ Categorias
Organizam o cardápio (Esfihas Salgadas, Esfihas Doces, Bebidas…). Cada uma tem um emoji
e uma ordem de exibição.

## 🏪 Loja e horários
- Nome, frase de apresentação, endereço da retirada e aviso no topo do cardápio
- **WhatsApp que recebe os pedidos**
- Horário de funcionamento de cada dia da semana (com dias fechados)
- **Tempo mínimo de preparo** — o cliente não consegue marcar um horário antes disso
- **Intervalo entre horários** — de quantos em quantos minutos aparecem as opções
- **Antecedência máxima** — até quantos dias à frente dá para agendar
- **Pedido mínimo** (opcional)

Tudo o que você salva aqui aparece no site na hora, sem precisar publicar de novo.

## 🔒 Minha conta
Troca a senha do painel.

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

Só falta o cliente apertar enviar. O número que recebe é o configurado em
**Loja e horários**.

> O horário só está confirmado quando você responder o cliente no WhatsApp.
> O site não reserva nada sozinho.

---

## Rodar no seu computador antes de publicar

```bash
npm run dev
```

Abre em http://localhost:3000. Sem Node instalado, funciona igual com Python:

```bash
python3 -m http.server 3000
```

Não há dependências nem passo de build: editou o arquivo, atualizou a página.

---

## Organização dos arquivos

```
index.html            site do cliente
admin.html             painel do administrador
CNAME                  o endereço esfihariajatai.ggsistemas.dev.br
css/                   estilos
js/
  config.js            ⚙️ endereço e chave do Supabase (você preenche)
  supabase.js          conexão com o banco
  data.js              tudo que lê e grava no banco
  app.js               cardápio, carrinho e checkout
  admin.js             painel
  cart.js              carrinho salvo no navegador
  schedule.js          cálculo dos horários de retirada
  utils.js             formatação de dinheiro e telefone

supabase/
  schema.sql           script que monta o banco (rodar uma vez)
```

Tudo na **raiz do repositório**, no mesmo padrão do renato.ggsistemas.dev.br: o
GitHub Pages publica direto da branch `main`, sem precisar de uma subpasta.

---

## Coisas boas de saber

- **O plano gratuito do Supabase pausa projetos parados.** Um site com movimento não
  chega perto disso, mas se a loja ficar semanas sem acessos, entre no painel do
  Supabase e clique em *Restore* para religar.
- **Backup:** no Supabase, em **Database → Backups**, dá para baixar uma cópia. Vale
  fazer isso depois de cadastrar o cardápio inteiro.
- **Uma versão anterior deste site rodava em servidor Node com SQLite.** Ela continua
  no histórico do Git (commit `632a834`), caso um dia você queira hospedar por conta
  própria em vez de usar o Supabase.
