export async function getSomething(event: any) {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: `Here's your ${event.pathParameters?.thing}!`,
        }),
    };
}
