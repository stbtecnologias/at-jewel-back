/**
 * OS CAMPOS SENSIVEIS SAEM PARA QUEM NAO DEVERIA? — 01/10/2026.
 *
 * ==========================================================================
 * O QUE OS SPECS NAO PROVAM.
 *
 * Os specs provam a ENTIDADE: `toPublic(false)` nao traz a chave. Isto aqui
 * prova a PORTA — que o controller passa a opcao certa, que o guard exige a
 * permissao certa, e que o JSON que sai pela rede e o esperado.
 *
 * Foi exatamente a distancia entre as duas coisas que deixou o custo vazando
 * por tres dias depois de 28/09: o serializador do produto estava certo, e a
 * venda tinha outra porta.
 * ==========================================================================
 *
 * A SENHA ENTRA POR ARGUMENTO e nao e gravada em lugar nenhum.
 *
 *   npx ts-node scripts/conferir-campos-sensiveis.ts <email> <senha>
 *
 * Rodar DUAS vezes e comparar:
 *   - com a sua conta (SUPERADMIN, curinga)  -> os campos DEVEM aparecer
 *   - com `nathalia@gmail.com` (GERENTE_VENDAS) -> NAO devem aparecer
 */
const BASE = process.env.API_URL ?? 'http://localhost:3000';

type Json = Record<string, unknown>;

async function pedir(caminho: string, token?: string): Promise<Json> {
  const r = await fetch(BASE + caminho, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!r.ok) throw new Error(`${caminho} -> ${r.status} ${await r.text()}`);
  return (await r.json()) as Json;
}

async function main() {
  const [email, senha] = process.argv.slice(2);
  if (!email || !senha) {
    console.error(
      '\n  uso: npx ts-node scripts/conferir-campos-sensiveis.ts <email> <senha>\n',
    );
    process.exit(1);
  }

  const login = await (
    await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    })
  ).json();
  const token = (login as { accessToken?: string }).accessToken;
  if (!token) {
    console.error('\n  login falhou. Confira e-mail e senha.\n');
    process.exit(1);
  }

  const papel = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64').toString(),
  ).role as string;

  console.log('');
  console.log(`  ${email}   papel: ${papel}`);
  console.log(`  ${BASE}`);
  console.log('');

  // ---- 1. o custo por peca, no detalhe da venda ----------------------
  try {
    const lista = (await pedir('/vendas?limit=1', token)) as {
      itens?: { id: string }[];
    };
    const id = lista.itens?.[0]?.id;
    if (!id) {
      console.log('  custo na venda       — sem venda na base para conferir');
    } else {
      const venda = await pedir(`/vendas/${id}`, token);
      const itens = (venda.itens ?? []) as Json[];
      const tem = itens.some((i) => 'valorCustoUnitario' in i);
      console.log(
        `  custo na venda       — ${tem ? '\x1b[31mAPARECE\x1b[0m' : '\x1b[32mausente\x1b[0m'}   (${itens.length} item(s))`,
      );
    }
  } catch (e) {
    console.log(`  custo na venda       — ${(e as Error).message.slice(0, 70)}`);
  }

  // ---- 2. o WhatsApp do perfil do cliente ----------------------------
  try {
    const lista = (await pedir('/clientes?limit=20', token)) as {
      itens?: { id: string }[];
    };
    let achou = false;
    for (const c of lista.itens ?? []) {
      const cliente = await pedir(`/clientes/${c.id}`, token);
      const perfil = cliente.perfil as Json | null;
      const wa = perfil?.whatsapp as string | undefined;
      if (!wa) continue;
      achou = true;
      const mascarado = wa.includes('•');
      console.log(
        `  whatsapp do perfil   — ${mascarado ? '\x1b[32mmascarado\x1b[0m' : '\x1b[31mLEGIVEL\x1b[0m'}   ${wa}`,
      );
      break;
    }
    if (!achou) {
      console.log('  whatsapp do perfil   — nenhum cliente com perfil nos 20 primeiros');
    }
  } catch (e) {
    console.log(`  whatsapp do perfil   — ${(e as Error).message.slice(0, 70)}`);
  }

  console.log('');
  console.log('  esperado:  SUPERADMIN/ADMIN -> aparece e legivel');
  console.log('             GERENTE_VENDAS   -> ausente e mascarado');
  console.log('');
}

void main();
