import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import type { UserProfile } from "@shared/schema";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z.string().min(1, "Age is required"),
  gender: z.enum(["male", "female", "other"]),
  height: z.string().min(1, "Height is required"),
  weight: z.string().min(1, "Weight is required"),
  goal: z.enum(["lose_weight", "maintain", "gain_muscle"]),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function Profile() {
  const { user, login } = useAuth();
  const { toast } = useToast();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      age: user?.age.toString() || "",
      gender: user?.gender || "male",
      height: user?.height.toString() || "",
      weight: user?.weight.toString() || "",
      goal: user?.goal || "maintain",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const payload = {
        ...data,
        age: parseInt(data.age),
        height: parseFloat(data.height),
        weight: parseFloat(data.weight),
      };
      const response = await apiRequest<UserProfile>("PUT", "/api/user/profile", payload);
      return response;
    },
    onSuccess: (data) => {
      login(data);
      toast({
        title: "Profile updated!",
        description: "Your information has been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateMutation.mutate(data);
  };

  const getBmiColor = (status: string) => {
    switch (status) {
      case "underweight":
        return "text-blue-500";
      case "normal":
        return "text-primary";
      case "overweight":
        return "text-accent";
      case "obese":
        return "text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-['Poppins'] mb-2">Profile</h1>
        <p className="text-base text-muted-foreground leading-relaxed">
          Manage your personal information and fitness goals
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="p-8 text-center space-y-4">
            <Avatar className="w-32 h-32 mx-auto shadow-xl">
              <AvatarFallback className="text-4xl font-bold bg-primary text-primary-foreground">
                {user?.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold font-['Poppins']" data-testid="text-profile-name">
                {user?.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">@{user?.username}</p>
            </div>
          </Card>

          <Card className="p-8 text-center space-y-4">
            <div className={`w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center ${getBmiColor(user?.bmiStatus || "")}`}>
              <div className="text-3xl font-bold" data-testid="text-profile-bmi">
                {user?.bmi.toFixed(1)}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">BMI Status</p>
              <p className={`text-lg font-semibold capitalize ${getBmiColor(user?.bmiStatus || "")}`} data-testid="text-profile-bmi-status">
                {user?.bmiStatus}
              </p>
            </div>
          </Card>
        </div>

        {/* Main Form */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-semibold font-['Poppins']">
                Edit Profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold font-['Poppins'] border-b pb-2">
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Full Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                className="h-12 px-4 rounded-lg"
                                data-testid="input-edit-name"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="age"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Age</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                className="h-12 px-4 rounded-lg"
                                data-testid="input-edit-age"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Gender</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-12 rounded-lg" data-testid="select-edit-gender">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="goal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Fitness Goal</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-12 rounded-lg" data-testid="select-edit-goal">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="lose_weight">Lose Weight</SelectItem>
                                <SelectItem value="maintain">Maintain Weight</SelectItem>
                                <SelectItem value="gain_muscle">Gain Muscle</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold font-['Poppins'] border-b pb-2">
                      Body Measurements
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="height"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Height (cm)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="0.1"
                                className="h-12 px-4 rounded-lg"
                                data-testid="input-edit-height"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="weight"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Weight (kg)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step="0.1"
                                className="h-12 px-4 rounded-lg"
                                data-testid="input-edit-weight"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 rounded-lg font-semibold"
                    disabled={updateMutation.isPending}
                    data-testid="button-save-profile"
                  >
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
