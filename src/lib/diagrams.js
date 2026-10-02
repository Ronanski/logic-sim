// Logic diagram data access (Lovable Cloud). Each row belongs to the signed-in user (RLS).
import { supabase } from "@/integrations/supabase/client";

const toRecord = (row) => row && { ...row, updated_date: row.updated_at, created_date: row.created_at };

export async function listDiagrams(limit = 50) {
  const { data, error } = await supabase
    .from("logic_diagrams")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map(toRecord);
}

export async function getDiagram(id) {
  const { data, error } = await supabase.from("logic_diagrams").select("*").eq("id", id).single();
  if (error) throw error;
  return toRecord(data);
}

export async function createDiagram(values) {
  const { data, error } = await supabase.from("logic_diagrams").insert(values).select().single();
  if (error) throw error;
  return toRecord(data);
}

export async function updateDiagram(id, values) {
  const { error } = await supabase.from("logic_diagrams").update(values).eq("id", id);
  if (error) throw error;
}

export async function deleteDiagram(id) {
  const { error } = await supabase.from("logic_diagrams").delete().eq("id", id);
  if (error) throw error;
}

// Live updates for one diagram (changes saved from another open session).
export function subscribeDiagram(id, onUpdate) {
  const channel = supabase
    .channel(`logic_diagram_${id}_${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "logic_diagrams", filter: `id=eq.${id}` },
      (payload) => onUpdate(toRecord(payload.new)),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
