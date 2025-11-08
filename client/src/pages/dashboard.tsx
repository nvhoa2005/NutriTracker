import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { Flame, Target, TrendingUp } from "lucide-react";
import type { CalorieStats, MealSuggestion } from "@shared/schema";
const grilledChickenImg = "/generated_images/Grilled_chicken_healthy_meal_999f188d.png";
const oatmealImg = "/generated_images/Healthy_oatmeal_breakfast_bowl_499dd866.png";
const saladImg = "/generated_images/Fresh_garden_salad_bowl_24dd7d21.png";
const heroImg = "/generated_images/Healthy_lifestyle_hero_banner_e3f16027.png";

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<CalorieStats>({
    queryKey: ["/api/calories/daily"],
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<MealSuggestion[]>({
    queryKey: ["/api/meals/suggestions"],
  });

  const calorieGoal = stats?.goal || 2000;
  const caloriesConsumed = stats?.total || 0;
  const caloriesRemaining = stats?.remaining || calorieGoal;
  const progressPercentage = Math.min((caloriesConsumed / calorieGoal) * 100, 100);

  const defaultSuggestions: MealSuggestion[] = [
    {
      id: "1",
      name: "Grilled Chicken with Vegetables",
      calories: 350,
      imageUrl: grilledChickenImg,
      description: "Lean protein with fiber-rich vegetables",
    },
    {
      id: "2",
      name: "Oatmeal Bowl with Berries",
      calories: 280,
      imageUrl: oatmealImg,
      description: "Heart-healthy breakfast with antioxidants",
    },
    {
      id: "3",
      name: "Fresh Garden Salad",
      calories: 180,
      imageUrl: saladImg,
      description: "Nutrient-dense, low-calorie option",
    },
  ];

  const displaySuggestions = !suggestions || suggestions.length === 0 ? defaultSuggestions : suggestions;


  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div
        className="relative h-64 lg:h-80 rounded-2xl overflow-hidden"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.3)), url(${heroImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-12 text-white">
          <h1 className="text-3xl lg:text-4xl font-bold font-['Poppins'] mb-2">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-lg lg:text-xl text-white/90 leading-relaxed">
            Track your nutrition and achieve your fitness goals
          </p>
        </div>
      </div>

      {/* Calorie Summary Card */}
      <div className="flex justify-center">
        <Card className="w-full max-w-4xl shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-semibold font-['Poppins'] text-center">
              Today's Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Flame className="h-12 w-12 text-primary" />
                <div>
                  <div className="text-4xl lg:text-5xl font-bold font-['Inter'] leading-none" data-testid="text-calories-consumed">
                    {statsLoading ? "..." : caloriesConsumed}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground mt-1">
                    of {calorieGoal} kcal
                  </div>
                </div>
              </div>
              <Progress value={progressPercentage} className="h-3" />
              <p className="text-base text-muted-foreground">
                <span className="font-semibold text-foreground" data-testid="text-calories-remaining">
                  {caloriesRemaining} kcal
                </span>{" "}
                remaining for today
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50 text-center space-y-2">
                <Target className="h-6 w-6 mx-auto text-primary" />
                <div className="text-2xl font-bold" data-testid="text-bmi">
                  {user?.bmi.toFixed(1)}
                </div>
                <div className="text-sm font-medium text-muted-foreground">BMI</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center space-y-2">
                <TrendingUp className="h-6 w-6 mx-auto text-primary" />
                <div className="text-2xl font-bold capitalize" data-testid="text-goal">
                  {user?.goal.replace("_", " ")}
                </div>
                <div className="text-sm font-medium text-muted-foreground">Goal</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50 text-center space-y-2">
                <div className="h-6 w-6 mx-auto rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">
                    {user?.bmiStatus.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-2xl font-bold capitalize" data-testid="text-bmi-status">
                  {user?.bmiStatus}
                </div>
                <div className="text-sm font-medium text-muted-foreground">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Meal Suggestions */}
      <div>
        <h2 className="text-2xl font-semibold font-['Poppins'] mb-8">
          Healthy Meal Suggestions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {displaySuggestions.map((meal) => (
            <Card key={meal.id} className="overflow-hidden hover-elevate" data-testid={`card-meal-${meal.id}`}>
              <div className="aspect-[4/3] relative">
                <img
                  src={meal.imageUrl}
                  alt={meal.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-lg text-sm font-bold">
                  {meal.calories} kcal
                </div>
              </div>
              <CardContent className="p-4 space-y-2">
                <h3 className="text-lg font-semibold font-['Inter']" data-testid={`text-meal-name-${meal.id}`}>
                  {meal.name}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {meal.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
