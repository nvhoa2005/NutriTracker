import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { 
  Flame, Target, TrendingUp, Clock, ChefHat, 
  Utensils, CheckCircle2, X, ChevronLeft, ChevronRight 
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { CalorieStats, MealSuggestion } from "@shared/schema";

interface RecipeData {
  description: string;
  ingredients: string[];
  instructions: string[];
  macros: {
    calories: number;
    protein: string;
    carbs: string;
    fat: string;
  };
  cookingTime: string;
  difficulty: string;
}

const grilledChickenImg = "/generated_images/Grilled_chicken_healthy_meal_999f188d.png";
const oatmealImg = "/generated_images/Healthy_oatmeal_breakfast_bowl_499dd866.png";
const saladImg = "/generated_images/Fresh_garden_salad_bowl_24dd7d21.png";
const heroImg = "/generated_images/Healthy_lifestyle_hero_banner_e3f16027.png";
const salmonAsparagusImg = "/generated_images/Salmon_with_asparagus_healthy_meal_2f4c8e1b.png";
const quinoaBowlImg = "/generated_images/Quinoa_black_bean_bowl_healthy_meal_3a6b7c9e.png";
const yogurtParfaitImg = "/generated_images/Greek_yogurt_parfait_healthy_snack_5c1e2d4f.png";
const avocadoToastImg = "/generated_images/Avocado_toast_with_poached_egg_healthy_meal_7d2f1a8c.png";
const turkeyWrapImg = "/generated_images/Turkey_hummus_wrap_healthy_lunch_1b3e4f6d.png";
const sweetPotatoCurryImg = "/generated_images/Sweet_potato_lentil_curry_healthy_meal_8e4f2b3a.png";
const zucchiniNoodlesImg = "/generated_images/Zucchini_noodles_with_pesto_healthy_meal_6f7a8b9c.png";

const placeholderImg = heroImg; 

export default function Dashboard() {
  const { user } = useAuth();
  
  const [selectedMeal, setSelectedMeal] = useState<MealSuggestion | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recipeData, setRecipeData] = useState<RecipeData | null>(null);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<CalorieStats>({
    queryKey: ["/api/calories/daily"],
  });

  const { data: suggestions, isLoading: suggestionsLoading } = useQuery<MealSuggestion[]>({
    queryKey: ["/api/meals/suggestions"],
  });

  const recipeMutation = useMutation({
    mutationFn: async (mealName: string) => {
      const res = await apiRequest<RecipeData>("POST", "/api/meals/recipe", { mealName });
      return res;
    },
    onSuccess: (data) => {
      setRecipeData(data);
    },
  });

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
    {
      id: "4",
      name: "Salmon with Asparagus",
      calories: 400,
      imageUrl: salmonAsparagusImg,
      description: "Omega-3 rich fish with roasted greens",
    },
    {
      id: "5",
      name: "Quinoa & Black Bean Bowl",
      calories: 320,
      imageUrl: quinoaBowlImg,
      description: "Plant-based protein power lunch",
    },
    {
      id: "6",
      name: "Greek Yogurt Parfait",
      calories: 250,
      imageUrl: yogurtParfaitImg,
      description: "Probiotic-rich snack with honey and nuts",
    },
    {
      id: "7",
      name: "Avocado Toast with Poached Egg",
      calories: 380,
      imageUrl: avocadoToastImg,
      description: "Healthy fats and protein on whole grain",
    },
    {
      id: "8",
      name: "Turkey & Hummus Wrap",
      calories: 340,
      imageUrl: turkeyWrapImg,
      description: "Light lunch with lean turkey breast",
    },
    {
      id: "9",
      name: "Sweet Potato & Lentil Curry",
      calories: 420,
      imageUrl: sweetPotatoCurryImg,
      description: "Warm, comforting, and full of fiber",
    },
    {
      id: "10",
      name: "Zucchini Noodles with Pesto",
      calories: 210,
      imageUrl: zucchiniNoodlesImg,
      description: "Low-carb alternative to traditional pasta",
    },
  ];

  const mealList = !suggestions || suggestions.length === 0 ? defaultSuggestions : suggestions;

  const nextSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % mealList.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + mealList.length) % mealList.length);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (!isHovered) {
      interval = setInterval(() => {
        nextSlide();
      }, 2500); 
    }

    return () => clearInterval(interval);
  }, [isHovered, mealList.length]);

  const visibleMeals = [
    mealList[currentIndex % mealList.length],
    mealList[(currentIndex + 1) % mealList.length],
    mealList[(currentIndex + 2) % mealList.length],
  ];

  const handleMealClick = (meal: MealSuggestion) => {
    setSelectedMeal(meal);
    setRecipeData(null);
    setIsDialogOpen(true);
    recipeMutation.mutate(meal.name);
  };

  const calorieGoal = stats?.goal || 2000;
  const caloriesConsumed = stats?.total || 0;
  const caloriesRemaining = stats?.remaining || calorieGoal;
  const progressPercentage = Math.min((caloriesConsumed / calorieGoal) * 100, 100);

  return (
    <div className="space-y-8">
      <div
        className="relative h-64 lg:h-80 rounded-2xl overflow-hidden shadow-xl"
        style={{
          backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.7), rgba(0,0,0,0.3)), url(${heroImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-12 text-white">
          <h1 className="text-3xl lg:text-4xl font-bold font-['Poppins'] mb-2 animate-in fade-in slide-in-from-left-4 duration-700">
            Welcome back, {user?.name}!
          </h1>
          <p className="text-lg lg:text-xl text-white/90 leading-relaxed max-w-xl">
            Track your nutrition and achieve your fitness goals
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <Card className="w-full max-w-4xl shadow-lg border-none bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl font-semibold font-['Poppins'] text-center">
              Today's Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2">
                <Flame className="h-12 w-12 text-orange-500 animate-pulse" />
                <div>
                  <div className="text-4xl lg:text-5xl font-bold font-['Inter'] leading-none text-primary">
                    {statsLoading ? "..." : caloriesConsumed}
                  </div>
                  <div className="text-sm font-medium text-muted-foreground mt-1">
                    of {calorieGoal} kcal
                  </div>
                </div>
              </div>
              <Progress value={progressPercentage} className="h-3 w-full max-w-md mx-auto" />
              <p className="text-base text-muted-foreground">
                <span className="font-bold text-foreground">
                  {caloriesRemaining} kcal
                </span>{" "}
                remaining for today
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-muted/50 text-center space-y-2 hover:bg-muted/80 transition-colors">
                <Target className="h-6 w-6 mx-auto text-blue-500" />
                <div className="text-2xl font-bold">{user?.bmi.toFixed(1)}</div>
                <div className="text-sm font-medium text-muted-foreground">BMI</div>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 text-center space-y-2 hover:bg-muted/80 transition-colors">
                <TrendingUp className="h-6 w-6 mx-auto text-green-500" />
                <div className="text-2xl font-bold capitalize">
                  {user?.goal.replace("_", " ")}
                </div>
                <div className="text-sm font-medium text-muted-foreground">Goal</div>
              </div>
              <div className="p-4 rounded-xl bg-muted/50 text-center space-y-2 hover:bg-muted/80 transition-colors">
                <div className="h-6 w-6 mx-auto rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">
                    {user?.bmiStatus.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-2xl font-bold capitalize">{user?.bmiStatus}</div>
                <div className="text-sm font-medium text-muted-foreground">Status</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div 
        className="space-y-6"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold font-['Poppins'] flex items-center gap-2">
            <Utensils className="h-6 w-6 text-primary" />
            Healthy Meal Suggestions
          </h2>
          
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={prevSlide} className="rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextSlide} className="rounded-full">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="relative overflow-hidden p-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {visibleMeals.map((meal, index) => (
              <Card 
                key={`${meal.id}-${index}`} 
                className="overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer group border-none bg-card animate-in fade-in slide-in-from-right-4 duration-500 fill-mode-both"
                onClick={() => handleMealClick(meal)}
              >
                <div className="aspect-[4/3] relative overflow-hidden">
                  <img
                    src={meal.imageUrl}
                    alt={meal.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                     <span className="text-white font-semibold text-sm">View Recipe & Details</span>
                  </div>
                  <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    <Flame className="h-3 w-3" /> {meal.calories} kcal
                  </div>
                </div>
                <CardContent className="p-5 space-y-2">
                  <h3 className="text-lg font-bold font-['Poppins'] group-hover:text-primary transition-colors line-clamp-1">
                    {meal.name}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                    {meal.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        
        <div className="flex justify-center gap-1.5 mt-4">
          {mealList.map((_, idx) => (
            <div 
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background">
          <div className="relative h-48 w-full shrink-0">
             {selectedMeal && (
               <img 
                 src={selectedMeal.imageUrl} 
                 alt={selectedMeal.name} 
                 className="w-full h-full object-cover"
               />
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
             <div className="absolute bottom-4 left-6 right-6">
               <DialogTitle className="text-2xl md:text-3xl font-bold text-foreground font-['Poppins'] shadow-black drop-shadow-md">
                 {selectedMeal?.name}
               </DialogTitle>
             </div>
             <button 
                onClick={() => setIsDialogOpen(false)}
                className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white backdrop-blur-sm transition-colors"
             >
                <X className="h-5 w-5" />
             </button>
          </div>

          <ScrollArea className="flex-1 p-6">
            {recipeMutation.isPending || !recipeData ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
                <div className="space-y-2">
                   <Skeleton className="h-6 w-1/3" />
                   <Skeleton className="h-4 w-full" />
                   <Skeleton className="h-4 w-full" />
                   <Skeleton className="h-4 w-full" />
                </div>
              </div>
            ) : (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="space-y-4">
                  <p className="text-muted-foreground leading-relaxed italic">
                    "{recipeData.description}"
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Badge variant="secondary" className="px-3 py-1 text-sm flex gap-1 items-center">
                      <Clock className="h-3.5 w-3.5" /> {recipeData.cookingTime}
                    </Badge>
                    <Badge variant="secondary" className="px-3 py-1 text-sm flex gap-1 items-center">
                      <ChefHat className="h-3.5 w-3.5" /> {recipeData.difficulty}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 md:gap-4 p-4 rounded-xl bg-muted/30 border border-border/50">
                   <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Calories</p>
                      <p className="text-lg font-bold text-primary">{recipeData.macros.calories}</p>
                   </div>
                   <div className="text-center border-l border-border/50">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Protein</p>
                      <p className="text-lg font-bold">{recipeData.macros.protein}</p>
                   </div>
                   <div className="text-center border-l border-border/50">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Carbs</p>
                      <p className="text-lg font-bold">{recipeData.macros.carbs}</p>
                   </div>
                   <div className="text-center border-l border-border/50">
                      <p className="text-xs text-muted-foreground uppercase font-semibold">Fat</p>
                      <p className="text-lg font-bold">{recipeData.macros.fat}</p>
                   </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-foreground">
                      <span className="bg-primary/10 p-1.5 rounded-lg text-primary"><Utensils className="h-4 w-4" /></span>
                      Ingredients
                    </h3>
                    <ul className="space-y-2">
                      {recipeData.ingredients.map((item, idx) => (
                        <li key={idx} className="flex gap-3 text-sm group">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5 opacity-50 group-hover:opacity-100 transition-opacity" />
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-foreground">
                       <span className="bg-primary/10 p-1.5 rounded-lg text-primary"><ChefHat className="h-4 w-4" /></span>
                       Instructions
                    </h3>
                    <div className="space-y-4">
                      {recipeData.instructions.map((step, idx) => (
                        <div key={idx} className="flex gap-3 text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground border border-border">
                            {idx + 1}
                          </div>
                          <p className="text-muted-foreground leading-relaxed pt-0.5">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}