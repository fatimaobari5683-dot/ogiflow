import { z } from 'zod';

/**
 * Validation stricte des entrées d'authentification.
 * Le numéro de téléphone est la clé d'identité principale (contexte marché marocain),
 * l'email reste optionnel.
 */

export const phoneSchema = z
  .string()
  .regex(/^\+?[0-9]{9,15}$/, 'Numéro de téléphone invalide');

export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial');

export const registerSchema = z
  .object({
    firstName: z.string().min(2).max(100),
    lastName: z.string().min(2).max(100),
    phone: phoneSchema,
    email: z.string().email().optional(),
    password: passwordSchema,
    role: z.enum(['SUPPLIER', 'DRIVER', 'CUSTOMER']), // les rôles internes ne sont jamais auto-inscrits
    companyName: z.string().min(2).max(150).optional(),
    vehicleType: z.enum(['MOTORCYCLE', 'CAR', 'VAN', 'BICYCLE', 'TRUCK']).optional(),
    // Adresse déclarée et zone principale — obligatoires pour un livreur dès
    // l'inscription (et non plus laissées "à définir plus tard") : un
    // livreur sans adresse ni zone n'est pas exploitable au dispatch avant
    // qu'un opérateur ne comble le champ, ce qui retardait inutilement sa
    // mise en service.
    address: z.string().min(5, 'Adresse trop courte').max(200).optional(),
    baseZoneId: z.string().min(1).optional(),
    // Code de parrainage d'un livreur déjà inscrit — optionnel, jamais
    // bloquant s'il est invalide (voir referrals.service.ts, linkReferral).
    referralCode: z.string().min(4).max(12).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'SUPPLIER' && !data.companyName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['companyName'], message: 'Raison sociale requise pour un compte fournisseur.' });
    }
    if (data.role === 'DRIVER' && !data.vehicleType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['vehicleType'], message: 'Type de véhicule requis pour un compte livreur.' });
    }
    if (data.role === 'DRIVER' && !data.address) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: 'Adresse requise pour un compte livreur.' });
    }
    if (data.role === 'DRIVER' && !data.baseZoneId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseZoneId'], message: 'Zone de rattachement requise pour un compte livreur.' });
    }
  });

export const loginSchema = z.object({
  identifier: z.string().min(3), // téléphone ou email
  password: z.string().min(1),
  mfaCode: z.string().length(6).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const mfaCodeSchema = z.object({
  code: z.string().length(6, 'Le code doit contenir 6 chiffres'),
});

export const disableMfaSchema = z.object({
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
export type DisableMfaInput = z.infer<typeof disableMfaSchema>;
