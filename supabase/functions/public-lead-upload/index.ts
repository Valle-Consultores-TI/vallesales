import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
  throw new Error("Configuracao do backend incompleta.");
}

const sql = postgres(databaseUrl, {
  max: 4,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

const storageClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const documentDisplayName = (documentType: string, originalName: string) => {
  if (documentType === "payroll-report") {
    return `Relatório Geral da Folha - ${originalName}`;
  }

  if (documentType === "trial-balance") {
    return `Balancete Mais Recente - ${originalName}`;
  }

  throw new Error("Tipo de documento invalido.");
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail("Metodo nao permitido.", 405);

  try {
    const formData = await req.formData();
    const leadId = normalizeOptionalString(formData.get("lead_id"));
    const documentType = normalizeOptionalString(formData.get("document_type"));
    const fileEntry = formData.get("file");

    if (!leadId) {
      return fail("Lead nao informado.");
    }

    if (!documentType) {
      return fail("Tipo de documento nao informado.");
    }

    if (!(fileEntry instanceof File)) {
      return fail("Arquivo nao informado.");
    }

    if (!fileEntry.size) {
      return fail("O arquivo enviado esta vazio.");
    }

    if (fileEntry.size > 15 * 1024 * 1024) {
      return fail("Cada arquivo deve ter no maximo 15 MB.");
    }

    const [lead] = await sql`
      select id
      from public.leads
      where id = ${leadId}
        and source = 'Formulario site'
        and created_at >= now() - interval '1 day'
      limit 1
    `;

    if (!lead) {
      return fail("Lead nao localizado para anexar o arquivo.", 404);
    }

    const safeFileName = fileEntry.name.replace(/[^\w.\- ]+/g, "_");
    const extension = safeFileName.includes(".") ? safeFileName.split(".").pop() : null;
    const fileName = documentDisplayName(documentType, safeFileName);
    const storagePath = `${leadId}/${crypto.randomUUID()}${extension ? `.${extension}` : ""}`;

    const { error: uploadError } = await storageClient.storage
      .from("lead-attachments")
      .upload(storagePath, fileEntry, {
        contentType: fileEntry.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      throw new Error("Nao foi possivel armazenar o arquivo enviado.");
    }

    await sql`
      insert into public.lead_attachments (
        lead_id,
        file_name,
        file_path,
        file_size,
        mime_type
      ) values (
        ${leadId},
        ${fileName},
        ${storagePath},
        ${fileEntry.size},
        ${fileEntry.type || null}
      )
    `;

    await sql`
      insert into public.lead_activities (lead_id, type, description)
      values (
        ${leadId},
        'attachment_added',
        ${`Arquivo recebido via captacao publica: ${fileName}`}
      )
    `;

    return json({ ok: true, file_name: fileName }, 201);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro inesperado ao anexar o arquivo.";
    return fail(message, 500);
  }
});
