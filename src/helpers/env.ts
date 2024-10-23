export function getRequiredEnv(name: string): string {
    const value = Deno.env.get(name); 

    if(!value){
        throw new Error(`Could not find required environment variable '${name}'`)
    }
    
    return value;
}