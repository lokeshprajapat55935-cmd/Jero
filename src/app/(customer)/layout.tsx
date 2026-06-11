import { CustomerBottomNav } from "@/components/navigation/CustomerBottomNav";

export default function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 pb-20">
      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto bg-white shadow-xl min-h-screen">
        {children}
      </main>

      {/* Persistent Bottom Navigation */}
      <CustomerBottomNav />
    </div>
  );
}
