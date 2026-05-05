import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useAddNote,
  useAssignableProfiles,
  useDeleteLead,
  useLeadActivities,
  useLeadAttachments,
  useLeadNotes,
  useLogContact,
  useUpdateLead,
  useUploadAttachment,
  downloadAttachment,
} from "@/hooks/useLeads";
import { useAuth } from "@/hooks/useAuth";
import type { Lead, PipelineStage, Profile } from "@/types/crm";
import { CONTACT_METHOD_OPTIONS, formatCurrency, formatDate, formatDateTime } from "@/lib/constants";
import {
  Calendar,
  DollarSign,
  Download,
  FileText,
  FileUp,
  History,
  Loader2,
  Mail,
  MapPin,
  MessageSquarePlus,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";

interface Props {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: Profile[];
  stages: PipelineStage[];
  canEditLead: boolean;
  canDeleteLead: boolean;
  onEdit: () => void;
}

const tempColors: Record<string, string> = {
  frio: "bg-temp-frio/10 text-temp-frio border-temp-frio/30",
  morno: "bg-temp-morno/10 text-temp-morno border-temp-morno/30",
  quente: "bg-temp-quente/10 text-temp-quente border-temp-quente/30",
};

const tempLabel: Record<string, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

const activityLabel: Record<string, string> = {
  stage_change: "Mudanca de etapa",
  owner_change: "Mudanca de responsavel",
  note_added: "Observacao",
  contact_logged: "Contato realizado",
  attachment_added: "Anexo",
  lead_created: "Lead criado",
  lead_updated: "Atualizacao",
};

export const LeadDetailsSheet = ({
  lead,
  open,
  onOpenChange,
  profiles,
  stages,
  canEditLead,
  canDeleteLead,
  onEdit,
}: Props) => {
  const [newNote, setNewNote] = useState("");
  const [contactMethod, setContactMethod] = useState("whatsapp");
  const [contactDesc, setContactDesc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const activities = useLeadActivities(lead?.id ?? null);
  const notes = useLeadNotes(lead?.id ?? null);
  const attachments = useLeadAttachments(lead?.id ?? null);
  const addNote = useAddNote(lead?.id ?? "");
  const logContact = useLogContact(lead?.id ?? "");
  const upload = useUploadAttachment(lead?.id ?? "");
  const del = useDeleteLead();
  const updateLead = useUpdateLead();
  const { data: assignableProfiles = [] } = useAssignableProfiles();
  const { user } = useAuth();

  if (!lead) return null;

  const stage = stages.find((item) => item.id === lead.stage_id);
  const assignableIds = new Set(assignableProfiles.map((profile) => profile.id));
  const ownerOptions = profiles.filter((profile) => assignableIds.has(profile.id) || profile.id === lead.owner_id);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote.mutateAsync(newNote.trim());
    setNewNote("");
  };

  const handleLogContact = async () => {
    await logContact.mutateAsync({ method: contactMethod, description: contactDesc });
    setContactDesc("");
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await upload.mutateAsync(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async () => {
    if (!confirm("Excluir este lead permanentemente?")) return;
    await del.mutateAsync(lead.id);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        <div className="bg-gradient-header p-6 text-header-foreground">
          <SheetHeader className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="truncate text-xl text-header-foreground">
                  {lead.company_or_person}
                </SheetTitle>
                {lead.contact_name && (
                  <SheetDescription className="text-header-muted">
                    {lead.contact_name}
                  </SheetDescription>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-header-foreground hover:bg-header-hover/10"
                  onClick={onEdit}
                  disabled={!canEditLead}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-header-foreground hover:bg-destructive/30"
                  onClick={handleDelete}
                  disabled={!canDeleteLead}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage && <Badge variant="secondary">{stage.name}</Badge>}
              <Badge variant="outline" className={`${tempColors[lead.temperature]} border`}>
                {tempLabel[lead.temperature]}
              </Badge>
              {lead.has_been_contacted && (
                <Badge variant="outline" className="border-success/30 bg-success/20 text-success">
                  Contatado
                </Badge>
              )}
            </div>
          </SheetHeader>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {lead.phone && <Info icon={<Phone className="h-3.5 w-3.5" />} label="Telefone" value={lead.phone} />}
            {lead.email && <Info icon={<Mail className="h-3.5 w-3.5" />} label="E-mail" value={lead.email} />}
            {(lead.city || lead.uf) && (
              <Info
                icon={<MapPin className="h-3.5 w-3.5" />}
                label="Localizacao"
                value={[lead.city, lead.uf].filter(Boolean).join(" / ")}
              />
            )}

            <div className="col-span-2 space-y-1">
              <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                <UserIcon className="h-3.5 w-3.5" />
                Responsavel
              </p>
              <Select
                value={lead.owner_id || "__none__"}
                onValueChange={(value) =>
                  updateLead.mutate({ id: lead.id, owner_id: value === "__none__" ? null : value })
                }
                disabled={updateLead.isPending || !canEditLead}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sem responsavel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem responsavel</SelectItem>
                  {ownerOptions.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email}
                      {user?.id === profile.id ? " (eu)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {Number(lead.estimated_value) > 0 && (
              <Info
                icon={<DollarSign className="h-3.5 w-3.5" />}
                label="Valor"
                value={formatCurrency(Number(lead.estimated_value))}
              />
            )}
            {lead.next_follow_up && (
              <Info
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Proximo follow-up"
                value={formatDate(lead.next_follow_up)}
              />
            )}
            {lead.source && <Info label="Origem" value={lead.source} />}
            {lead.segment && <Info label="Segmento" value={lead.segment} />}
          </div>

          {lead.notes && (
            <Card className="border-0 bg-secondary/40 p-3 text-sm whitespace-pre-wrap">
              {lead.notes}
            </Card>
          )}

          <Separator />

          <Tabs defaultValue="history">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="history">
                <History className="mr-1 h-3.5 w-3.5" />
                Historico
              </TabsTrigger>
              <TabsTrigger value="notes">
                <FileText className="mr-1 h-3.5 w-3.5" />
                Observacoes
              </TabsTrigger>
              <TabsTrigger value="files">
                <Paperclip className="mr-1 h-3.5 w-3.5" />
                Anexos
              </TabsTrigger>
            </TabsList>

            <TabsContent value="history" className="mt-4 space-y-4">
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <PhoneCall className="h-4 w-4" />
                  Registrar contato
                </h4>
                <div className="flex gap-2">
                  <Select value={contactMethod} onValueChange={setContactMethod} disabled={!canEditLead}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_METHOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    rows={1}
                    placeholder="Descricao (opcional)"
                    value={contactDesc}
                    onChange={(event) => setContactDesc(event.target.value)}
                    className="min-h-9 flex-1"
                    disabled={!canEditLead}
                  />
                  <Button size="sm" onClick={handleLogContact} disabled={logContact.isPending || !canEditLead}>
                    {logContact.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Registrar
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Linha do tempo</h4>
                {activities.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : activities.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma atividade.</p>
                ) : (
                  <div className="space-y-2">
                    {activities.data?.map((activity) => (
                      <div key={activity.id} className="flex gap-3 border-l-2 border-accent py-1 pl-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {activityLabel[activity.type]}
                          </p>
                          <p className="text-foreground">{activity.description}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {formatDateTime(activity.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="notes" className="mt-4 space-y-4">
              <div className="space-y-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquarePlus className="h-4 w-4" />
                  Nova observacao
                </h4>
                <Textarea
                  rows={3}
                  placeholder="Escreva uma observacao..."
                  value={newNote}
                  onChange={(event) => setNewNote(event.target.value)}
                  disabled={!canEditLead}
                />
                <Button size="sm" onClick={handleAddNote} disabled={addNote.isPending || !newNote.trim() || !canEditLead}>
                  {addNote.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Adicionar
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                {notes.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem observacoes.</p>
                ) : (
                  notes.data?.map((note) => (
                    <Card key={note.id} className="p-3 text-sm">
                      <p className="whitespace-pre-wrap">{note.content}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {formatDateTime(note.created_at)}
                      </p>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="files" className="mt-4 space-y-4">
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={upload.isPending || !canEditLead}
                >
                  {upload.isPending ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileUp className="mr-1 h-3.5 w-3.5" />
                  )}
                  Enviar arquivo
                </Button>
              </div>

              <div className="space-y-2">
                {attachments.data?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem anexos.</p>
                ) : (
                  attachments.data?.map((attachment) => (
                    <Card key={attachment.id} className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{attachment.file_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDateTime(attachment.created_at)}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => downloadAttachment(attachment.file_path, attachment.file_name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Info = ({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) => (
  <div className="space-y-0.5">
    <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
      {icon}
      {label}
    </p>
    <p className="break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);
