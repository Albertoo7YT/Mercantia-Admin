"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ACCEPTED_LOGO_MIME,
  BRANDING_FIELD_LABELS,
  MAX_LOGO_BYTES,
  type BrandingField,
  type TenantBrandingPayload,
  type ValidationErrors,
} from "@/lib/types/tenant-branding";
import { cn } from "@/lib/utils";

type Props = {
  tenantId: string;
  payload: Partial<TenantBrandingPayload>;
  errors: ValidationErrors;
  onChange: (
    field: BrandingField,
    value: string | undefined,
  ) => void;
  disabled?: boolean;
};

export function BrandingForm({
  tenantId,
  payload,
  errors,
  onChange,
  disabled,
}: Props) {
  return (
    <div className="space-y-4">
      <Section title="Identidad">
        <FieldRow
          field="appName"
          required
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
          placeholder="Mercantia"
        />
        <ColorField
          field="brandColor"
          required
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorField
            field="brandColorHover"
            payload={payload}
            errors={errors}
            onChange={onChange}
            disabled={disabled}
          />
          <ColorField
            field="brandColorContrast"
            payload={payload}
            errors={errors}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
        <LogoField
          tenantId={tenantId}
          field="logoUrl"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <LogoField
          tenantId={tenantId}
          field="logoSmallUrl"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <LogoField
          tenantId={tenantId}
          field="faviconUrl"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
          accept=".png,.ico,.svg"
        />
      </Section>

      <Section title="Contacto">
        <FieldRow
          field="supportEmail"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
          placeholder="soporte@empresa.com"
          type="email"
        />
        <FieldRow
          field="supportPhone"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
          placeholder="+34 600 000 000"
        />
        <FieldRow
          field="companyName"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <FieldRow
          field="companyLegalName"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <FieldRow
          field="companyAddress"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
      </Section>

      <Section title="Textos">
        <TextareaField
          field="welcomeMessage"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <FieldRow
          field="loginTitle"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <FieldRow
          field="loginSubtitle"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <FieldRow
          field="footerText"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
      </Section>

      <Section title="SEO">
        <FieldRow
          field="metaTitle"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
        <TextareaField
          field="metaDescription"
          payload={payload}
          errors={errors}
          onChange={onChange}
          disabled={disabled}
        />
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

type RowProps = {
  field: BrandingField;
  required?: boolean;
  payload: Partial<TenantBrandingPayload>;
  errors: ValidationErrors;
  onChange: (field: BrandingField, value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: string;
};

function FieldRow({
  field,
  required,
  payload,
  errors,
  onChange,
  disabled,
  placeholder,
  type,
}: RowProps) {
  const value = (payload[field] as string | undefined) ?? "";
  const err = errors[field];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`branding-${field}`}>
        {BRANDING_FIELD_LABELS[field]}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <Input
        id={`branding-${field}`}
        type={type}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        aria-invalid={Boolean(err) || undefined}
        className={cn(err && "border-destructive focus-visible:ring-destructive")}
      />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function TextareaField({
  field,
  payload,
  errors,
  onChange,
  disabled,
}: RowProps) {
  const value = (payload[field] as string | undefined) ?? "";
  const err = errors[field];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`branding-${field}`}>
        {BRANDING_FIELD_LABELS[field]}
      </Label>
      <Textarea
        id={`branding-${field}`}
        rows={3}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        disabled={disabled}
        aria-invalid={Boolean(err) || undefined}
        className={cn(err && "border-destructive focus-visible:ring-destructive")}
      />
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function ColorField({
  field,
  required,
  payload,
  errors,
  onChange,
  disabled,
}: RowProps) {
  const value = (payload[field] as string | undefined) ?? "";
  const err = errors[field];
  // The native color picker requires #RRGGBB; if the typed value is invalid
  // we just feed it a sensible fallback so the swatch remains usable.
  const swatchValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`branding-${field}`}>
        {BRANDING_FIELD_LABELS[field]}
        {required ? <span className="ml-1 text-destructive">*</span> : null}
      </Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Selector visual ${field}`}
          value={swatchValue}
          onChange={(e) => onChange(field, e.target.value.toUpperCase())}
          disabled={disabled}
          className="size-9 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input
          id={`branding-${field}`}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          disabled={disabled}
          placeholder="#2563EB"
          maxLength={7}
          className={cn(
            "font-mono uppercase",
            err && "border-destructive focus-visible:ring-destructive",
          )}
        />
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}

function LogoField({
  tenantId,
  field,
  payload,
  errors,
  onChange,
  disabled,
  accept = "image/png,image/jpeg,image/svg+xml,image/webp",
}: RowProps & { tenantId: string; accept?: string }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const value = (payload[field] as string | undefined) ?? "";
  const err = errors[field];

  async function handleFile(file: File) {
    if (file.size > MAX_LOGO_BYTES) {
      toast({
        title: "Archivo demasiado grande",
        description: "El logo debe pesar 2 MB o menos.",
        variant: "destructive",
      });
      return;
    }
    if (file.type && !ACCEPTED_LOGO_MIME.includes(file.type)) {
      toast({
        title: "Formato no permitido",
        description: `Permitidos: PNG, JPG, SVG, WEBP. Recibido: ${file.type}`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const res = await fetch(
        `/api/tenants/${tenantId}/branding/upload-logo`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        let body: { error?: string } = {};
        try {
          body = (await res.json()) as { error?: string };
        } catch {
          // ignore
        }
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { url: string };
      onChange(field, data.url);
      toast({ title: "Logo subido" });
    } catch (e) {
      toast({
        title: "No se pudo subir el logo",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`branding-${field}`}>
        {BRANDING_FIELD_LABELS[field]}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id={`branding-${field}`}
          value={value}
          onChange={(e) => onChange(field, e.target.value)}
          disabled={disabled || uploading}
          placeholder="/branding/logo.png"
          className={cn(
            "font-mono text-xs",
            err && "border-destructive focus-visible:ring-destructive",
          )}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          Subir
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange(field, "")}
            disabled={disabled || uploading}
            aria-label="Quitar logo"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
