import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { Download, Calendar, TrendingUp, Flame } from "lucide-react";
import type { FoodEntry } from "@shared/schema";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import jsPDF from "jspdf";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

type TimeRange = "daily" | "weekly" | "monthly";

export default function Tracker() {
  const [timeRange, setTimeRange] = useState<TimeRange>("daily");
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: entries, isLoading } = useQuery<FoodEntry[]>({
    queryKey: ["/api/calories/entries"],
  });

  const generateChartData = () => {
    if (!entries || entries.length === 0) {
      return {
        labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        datasets: [
          {
            label: "Calories",
            data: [1850, 2100, 1920, 2250, 1780, 2050, 1950],
            borderColor: "hsl(142, 76%, 45%)",
            backgroundColor: "hsl(142, 76%, 45%, 0.1)",
            tension: 0.4,
          },
        ],
      };
    }

    const labels: string[] = [];
    const data: number[] = [];

    if (timeRange === "daily") {
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString("en-US", { weekday: "short" }));
        
        const dayEntries = entries.filter((e) => {
          const entryDate = new Date(e.timestamp);
          return entryDate.toDateString() === date.toDateString();
        });
        data.push(dayEntries.reduce((sum, e) => sum + e.calories, 0));
      }
    } else if (timeRange === "weekly") {
      for (let i = 3; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (i * 7));
        labels.push(`Week ${4 - i}`);
        
        const weekEntries = entries.filter((e) => {
          const entryDate = new Date(e.timestamp);
          const diff = Math.floor((new Date().getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
          return diff >= i * 7 && diff < (i + 1) * 7;
        });
        data.push(weekEntries.reduce((sum, e) => sum + e.calories, 0));
      }
    } else {
      for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        labels.push(date.toLocaleDateString("en-US", { month: "short" }));
        
        const monthEntries = entries.filter((e) => {
          const entryDate = new Date(e.timestamp);
          return entryDate.getMonth() === date.getMonth() && 
                 entryDate.getFullYear() === date.getFullYear();
        });
        data.push(monthEntries.reduce((sum, e) => sum + e.calories, 0));
      }
    }

    return {
      labels,
      datasets: [
        {
          label: "Calories",
          data,
          borderColor: "hsl(142, 76%, 45%)",
          backgroundColor: "hsl(142, 76%, 45%, 0.1)",
          tension: 0.4,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: "hsl(215, 25%, 12%)",
        padding: 12,
        titleFont: {
          size: 14,
          weight: "bold",
        },
        bodyFont: {
          size: 13,
        },
        callbacks: {
          label: (context: any) => `${context.parsed.y} kcal`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: "hsl(214, 20%, 92%)",
        },
        ticks: {
          callback: (value: any) => `${value} kcal`,
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  const totalCalories = entries?.reduce((sum, e) => sum + e.calories, 0) || 0;
  const avgCalories = entries && entries.length > 0 
    ? Math.round(totalCalories / entries.length) 
    : 0;
  const todayCalories = entries?.filter((e) => {
    const today = new Date().toDateString();
    return new Date(e.timestamp).toDateString() === today;
  }).reduce((sum, e) => sum + e.calories, 0) || 0;

  const exportReport = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text("CalorieTrack - Calorie Report", 20, 20);
    
    doc.setFontSize(12);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 20, 35);
    
    doc.setFontSize(14);
    doc.text("Summary Statistics", 20, 50);
    
    doc.setFontSize(11);
    doc.text(`Total Calories Tracked: ${totalCalories} kcal`, 30, 60);
    doc.text(`Average Daily Calories: ${avgCalories} kcal`, 30, 70);
    doc.text(`Today's Calories: ${todayCalories} kcal`, 30, 80);
    doc.text(`Total Entries: ${entries?.length || 0}`, 30, 90);
    
    if (entries && entries.length > 0) {
      doc.text("Recent Food Entries", 20, 110);
      let yPos = 120;
      
      entries.slice(0, 15).forEach((entry, index) => {
        const date = new Date(entry.timestamp).toLocaleDateString();
        doc.text(`${index + 1}. ${entry.foodName} - ${entry.calories} kcal (${date})`, 30, yPos);
        yPos += 10;
        
        if (yPos > 280) {
          doc.addPage();
          yPos = 20;
        }
      });
    }
    
    doc.save("calorie-report.pdf");
    
    toast({
      title: "Report exported!",
      description: "Your calorie report has been downloaded.",
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold font-['Poppins'] mb-2">Calorie Tracker</h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Visualize your calorie consumption patterns and track your progress
          </p>
        </div>
        <Button
          onClick={exportReport}
          className="h-12 px-8 rounded-lg font-semibold gap-2"
          data-testid="button-export-report"
        >
          <Download className="h-5 w-5" />
          Export Report
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <Card className="p-8 text-center space-y-2">
          <Calendar className="h-12 w-12 mx-auto mb-4 text-primary" />
          <div className="text-4xl font-bold" data-testid="text-today-calories">
            {isLoading ? "..." : todayCalories}
          </div>
          <div className="text-sm font-medium text-muted-foreground">Today's Calories</div>
        </Card>
        <Card className="p-8 text-center space-y-2">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 text-primary" />
          <div className="text-4xl font-bold" data-testid="text-avg-calories">
            {isLoading ? "..." : avgCalories}
          </div>
          <div className="text-sm font-medium text-muted-foreground">Avg Daily Calories</div>
        </Card>
        <Card className="p-8 text-center space-y-2">
          <Flame className="h-12 w-12 mx-auto mb-4 text-primary" />
          <div className="text-4xl font-bold" data-testid="text-total-calories">
            {isLoading ? "..." : totalCalories}
          </div>
          <div className="text-sm font-medium text-muted-foreground">Total Calories</div>
        </Card>
        <Card className="p-8 text-center space-y-2">
          <div className="h-12 w-12 mx-auto mb-4 rounded-full bg-primary flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">{entries?.length || 0}</span>
          </div>
          <div className="text-4xl font-bold" data-testid="text-total-entries">
            {isLoading ? "..." : entries?.length || 0}
          </div>
          <div className="text-sm font-medium text-muted-foreground">Food Entries</div>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold font-['Poppins']">
            Calorie Trends
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-8">
          <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <TabsList className="grid w-full max-w-md grid-cols-3">
              <TabsTrigger value="daily" data-testid="tab-daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly" data-testid="tab-weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly" data-testid="tab-monthly">Monthly</TabsTrigger>
            </TabsList>
            <TabsContent value="daily" className="mt-8">
              <div className="h-96">
                <Line data={generateChartData()} options={chartOptions} />
              </div>
            </TabsContent>
            <TabsContent value="weekly" className="mt-8">
              <div className="h-96">
                <Bar data={generateChartData()} options={chartOptions} />
              </div>
            </TabsContent>
            <TabsContent value="monthly" className="mt-8">
              <div className="h-96">
                <Bar data={generateChartData()} options={chartOptions} />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Food Log Table */}
      {entries && entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-semibold font-['Poppins']">
              Food Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-food-log">
                <thead>
                  <tr className="border-b">
                    <th className="py-4 px-4 text-left font-semibold text-sm uppercase text-muted-foreground">
                      Date & Time
                    </th>
                    <th className="py-4 px-4 text-left font-semibold text-sm uppercase text-muted-foreground">
                      Food
                    </th>
                    <th className="py-4 px-4 text-right font-semibold text-sm uppercase text-muted-foreground">
                      Calories
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.slice(0, 20).map((entry) => (
                    <tr key={entry.id} className="border-b hover-elevate" data-testid={`row-entry-${entry.id}`}>
                      <td className="py-4 px-4 text-sm">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-sm font-medium">{entry.foodName}</td>
                      <td className="py-4 px-4 text-sm font-bold text-right text-primary">
                        {entry.calories} kcal
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
