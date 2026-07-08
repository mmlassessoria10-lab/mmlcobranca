import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Confiança e Privacidade | Photogenic" },
      {
        name: "description",
        content:
          "Como o Photogenic protege seus dados: autenticação, controle de acesso por papel, criptografia em trânsito e práticas de privacidade.",
      },
      { property: "og:title", content: "Confiança e Privacidade | Photogenic" },
      {
        property: "og:description",
        content:
          "Visão geral das práticas de segurança, privacidade e tratamento de dados do Photogenic.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <div className="text-sm leading-relaxed text-muted-foreground space-y-2">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold text-foreground">
            Photogenic
          </Link>
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Entrar
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 space-y-10">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Confiança, Segurança e Privacidade
          </h1>
          <p className="text-sm text-muted-foreground">
            Esta página é mantida pelo responsável do Photogenic para responder dúvidas comuns
            sobre segurança e privacidade. Ela descreve controles habilitados no aplicativo e não
            representa uma certificação independente.
          </p>
        </div>

        <Section title="Acesso e autenticação">
          <p>
            O acesso ao Photogenic requer autenticação. Cada usuário recebe um papel
            (Administrador, Financeiro ou Cobrança) que define quais áreas e dados podem ser
            visualizados ou modificados.
          </p>
          <p>
            A gestão de papéis é feita exclusivamente por administradores, dentro do próprio
            aplicativo.
          </p>
        </Section>

        <Section title="Proteção de dados no banco">
          <p>
            Os dados de clientes, contratos e parcelas ficam armazenados em um banco com
            Row-Level Security (RLS) habilitado. Políticas restringem leitura e escrita aos
            papéis autorizados; não há leitura pública desses dados.
          </p>
          <p>Toda a comunicação entre o navegador e o backend ocorre por HTTPS.</p>
        </Section>

        <Section title="Coleta e uso de dados">
          <p>
            O Photogenic coleta apenas as informações necessárias para gestão de cobranças:
            dados cadastrais dos clientes, contratos, parcelas e lembretes enviados.
          </p>
          <p>
            Dados importados via Excel ou colagem são processados para mapeamento de colunas
            por IA e em seguida persistidos conforme a confirmação do usuário.
          </p>
        </Section>

        <Section title="Sub-processadores e integrações">
          <p>
            O aplicativo utiliza serviços de infraestrutura e IA para hospedagem, banco de
            dados, autenticação e mapeamento inteligente de planilhas. Provedores específicos
            podem ser informados pelo responsável do aplicativo mediante solicitação.
          </p>
        </Section>

        <Section title="Retenção e exclusão">
          <p>
            Registros permanecem disponíveis enquanto forem necessários para a operação de
            cobrança. Solicitações de exclusão de dados podem ser feitas ao responsável do
            aplicativo.
          </p>
        </Section>

        <Section title="Contato">
          <p>
            Para dúvidas de privacidade, solicitações de titulares ou relato de
            vulnerabilidades, entre em contato com o responsável do Photogenic pelos canais
            informados internamente à sua organização.
          </p>
        </Section>

        <p className="text-xs text-muted-foreground pt-4 border-t">
          Este conteúdo é editável pelo responsável do aplicativo e descreve práticas atuais do
          Photogenic. Não constitui certificação, parecer jurídico ou garantia de conformidade
          regulatória.
        </p>
      </main>
    </div>
  );
}