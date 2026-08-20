import { db } from './db.js';

const CATEGORIES = [
  { name: 'Esfihas Salgadas', icon: '🥟', sort_order: 1 },
  { name: 'Esfihas Doces', icon: '🍫', sort_order: 2 },
  { name: 'Bebidas', icon: '🥤', sort_order: 3 },
];

const PRODUCTS = [
  // Esfihas salgadas
  ['Esfihas Salgadas', 'Esfiha de Carne', 'Carne bovina moída temperada com cebola, tomate e limão.', 800],
  ['Esfihas Salgadas', 'Esfiha de Carne com Queijo', 'Carne temperada coberta com mussarela derretida.', 950],
  ['Esfihas Salgadas', 'Esfiha de Frango com Catupiry', 'Frango desfiado com catupiry cremoso.', 950],
  ['Esfihas Salgadas', 'Esfiha de Queijo', 'Mussarela derretida com um toque de orégano.', 850],
  ['Esfihas Salgadas', 'Esfiha de Calabresa', 'Calabresa fatiada com cebola e mussarela.', 900],
  ['Esfihas Salgadas', 'Esfiha de Portuguesa', 'Presunto, queijo, ovo, cebola e azeitona.', 950],
  ['Esfihas Salgadas', 'Esfiha de Palmito', 'Palmito picado no creme de queijo.', 950],
  ['Esfihas Salgadas', 'Esfiha de Bacon com Cheddar', 'Bacon crocante com cheddar cremoso.', 1050],
  // Esfihas doces
  ['Esfihas Doces', 'Esfiha de Chocolate', 'Chocolate ao leite derretido na massa quentinha.', 900],
  ['Esfihas Doces', 'Esfiha de Chocolate com Morango', 'Chocolate ao leite com morangos frescos.', 1100],
  ['Esfihas Doces', 'Esfiha de Romeu e Julieta', 'Goiabada com queijo mussarela.', 950],
  ['Esfihas Doces', 'Esfiha de Banana com Canela', 'Banana, açúcar e canela.', 900],
  ['Esfihas Doces', 'Esfiha de Doce de Leite', 'Doce de leite cremoso com leite em pó.', 950],
  ['Esfihas Doces', 'Esfiha de Prestígio', 'Chocolate com coco ralado.', 1000],
  // Bebidas
  ['Bebidas', 'Coca-Cola Lata 350ml', 'Refrigerante gelado.', 600, 'lata 350ml'],
  ['Bebidas', 'Coca-Cola 600ml', 'Garrafa gelada.', 900, 'garrafa 600ml'],
  ['Bebidas', 'Guaraná Antarctica Lata 350ml', 'Refrigerante gelado.', 600, 'lata 350ml'],
  ['Bebidas', 'Guaraná Antarctica 2L', 'Ideal para dividir.', 1400, 'garrafa 2L'],
  ['Bebidas', 'Suco de Laranja Natural 500ml', 'Feito na hora, sem açúcar.', 1000, 'copo 500ml'],
  ['Bebidas', 'Água Mineral 500ml', 'Sem gás.', 400, 'garrafa 500ml'],
  ['Bebidas', 'Água com Gás 500ml', 'Gelada.', 500, 'garrafa 500ml'],
];

/** Popula o cardápio de exemplo apenas quando o banco está vazio. */
export function seedIfEmpty() {
  const hasProducts = db.prepare('SELECT COUNT(*) AS n FROM products').get().n > 0;
  const hasCategories = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n > 0;
  if (hasProducts || hasCategories) return false;

  const insertCategory = db.prepare(
    'INSERT INTO categories (name, icon, sort_order) VALUES (?, ?, ?)'
  );
  const insertProduct = db.prepare(
    `INSERT INTO products (category_id, name, description, price_cents, unit, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    const idByName = new Map();
    for (const c of CATEGORIES) {
      idByName.set(c.name, insertCategory.run(c.name, c.icon, c.sort_order).lastInsertRowid);
    }
    PRODUCTS.forEach(([category, name, description, price, unit], index) => {
      insertProduct.run(idByName.get(category), name, description, price, unit || 'unidade', index + 1);
    });
  })();

  console.log(`  Cardápio de exemplo criado com ${PRODUCTS.length} produtos.`);
  return true;
}

// Permite rodar `npm run seed` manualmente.
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  console.log(seedIfEmpty() ? 'Cardápio de exemplo inserido.' : 'O banco já tem dados, nada foi alterado.');
}
