import { z } from "zod";

import { isValidTurkishIdentityNo } from "@/lib/driverValidation";

export const loginSchema = z.object({
  email: z.string().email("Geçerli e-posta girin"),
  password: z.string().min(1, "Şifre zorunlu")
});

export const quickTripSchema = z.object({
  departure_at: z.string().min(1),
  arrival_estimated_at: z.string().min(1),
  description: z.string().optional(),
  vehicle_id: z.string().optional(),
  driver_id: z.string().optional(),
  vehicle: z.object({
    plate: z.string().min(3),
    seat_capacity: z.number().min(1),
    phone: z.string().optional()
  }),
  driver: z.object({
    identity_no: z.string().min(5),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    nationality: z.string().optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    uetds_role_code: z.number(),
    src_codes: z.string().optional()
  }),
  route: z.object({
    from: z.object({
      country: z.string().optional(),
      city: z.string().min(1),
      district: z.string().optional(),
      city_code: z.string().optional(),
      district_code: z.string().optional(),
      address: z.string().min(1),
      place: z.string().optional()
    }),
    to: z.object({
      country: z.string().optional(),
      city: z.string().min(1),
      district: z.string().optional(),
      city_code: z.string().optional(),
      district_code: z.string().optional(),
      address: z.string().min(1),
      place: z.string().optional()
    })
  }),
  groups: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      price: z.string().min(1),
      currency: z.string().optional()
    })
  ),
  passengers: z.array(
    z.object({
      first_name: z.string().min(1),
      last_name: z.string().min(1),
      identity_type: z.enum(["tc", "passport", "foreign_id", "unknown"]),
      identity_no: z.string().min(1),
      nationality: z.string().optional(),
      country_name: z.string().optional(),
      gender: z.string().optional(),
      seat_no: z.string().optional(),
      phone: z.string().optional(),
      group_index: z.number().optional()
    })
  ).min(1),
  route_note: z.string().optional()
}).superRefine((data, ctx) => {
  if (data.driver.identity_no && /^\d{11}$/.test(data.driver.identity_no) && !isValidTurkishIdentityNo(data.driver.identity_no)) {
    ctx.addIssue({
      code: "custom",
      message: "T.C. Kimlik numarası geçersiz.",
      path: ["driver", "identity_no"]
    });
  }
  data.passengers.forEach((passenger, index) => {
    if (passenger.identity_type === "tc" && /^\d{11}$/.test(passenger.identity_no) && !isValidTurkishIdentityNo(passenger.identity_no)) {
      ctx.addIssue({
        code: "custom",
        message: "T.C. Kimlik numarası geçersiz.",
        path: ["passengers", index, "identity_no"]
      });
    }
  });
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type QuickTripFormData = z.infer<typeof quickTripSchema>;
