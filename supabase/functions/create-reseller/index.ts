import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client with service role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller role
    const { data: roleData } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id).single();
    const callerRole = roleData?.role;

    if (!callerRole || !["admin", "reseller_master", "reseller_ultra"].includes(callerRole)) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, display_name, reseller_role, balance, client_limit } = await req.json();

    // Validate role assignment based on caller's role
    const allowedRoles: Record<string, string[]> = {
      admin: ["reseller", "reseller_master", "reseller_ultra", "admin"],
      reseller_master: ["reseller", "reseller_master"],
      reseller_ultra: ["reseller", "reseller_master"],
    };

    // Ultra can create ultra only if allowed
    if (callerRole === "reseller_ultra" && reseller_role === "reseller_ultra") {
      const { data: ultraData } = await adminClient
        .from("resellers").select("can_create_ultra").eq("user_id", caller.id).single();
      if (!ultraData?.can_create_ultra) {
        return new Response(JSON.stringify({ error: "Sem permissão para criar Revendedor Ultra" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (!allowedRoles[callerRole]?.includes(reseller_role)) {
      return new Response(JSON.stringify({ error: "Cargo não permitido para seu nível" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Create auth user (no session switch!)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = authData.user.id;

    // 2. Set the correct role (trigger already created 'client', update it)
    const { error: roleError } = await adminClient
      .from("user_roles").update({ role: reseller_role }).eq("user_id", newUserId);
    if (roleError) {
      console.error("Role update error:", roleError);
    }

    // 3. Create reseller record
    const { error: resellerError } = await adminClient.from("resellers").insert({
      user_id: newUserId,
      balance: balance || 0,
      client_limit: client_limit || 50,
      created_by: caller.id,
    });
    if (resellerError) {
      console.error("Reseller insert error:", resellerError);
    }

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
